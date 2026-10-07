import AVFoundation
import CoreGraphics
import ExpoModulesCore
import Photos
import UIKit

private final class SaviaWavFile {
  let url: URL
  let rate: Int
  private let file: FileHandle
  private var frames: Int64 = 0

  init(url: URL, rate: Int) throws {
    self.url = url
    self.rate = rate
    FileManager.default.createFile(atPath: url.path, contents: Data(repeating: 0, count: 44))
    file = try FileHandle(forWritingTo: url)
  }

  func append(atFrame: Int64, data: Data) throws {
    guard data.count % 4 == 0 else { return }
    let start = max(0, atFrame)
    if start > frames {
      try file.seek(toOffset: UInt64(44 + frames * 4))
      var gap = start - frames
      let zeros = Data(repeating: 0, count: 8192)
      while gap > 0 {
        let count = Int(min(gap * 4, 8192))
        try file.write(contentsOf: zeros.prefix(count))
        gap -= Int64(count / 4)
      }
      frames = start
    }
    let skipped = Int(max(0, frames - atFrame) * 4)
    guard skipped < data.count else { return }
    try file.seek(toOffset: UInt64(44 + frames * 4))
    try file.write(contentsOf: data.dropFirst(skipped))
    frames += Int64((data.count - skipped) / 4)
  }

  func finish(durationFrames: Int64) throws {
    frames = max(1, durationFrames)
    try file.truncate(atOffset: UInt64(44 + frames * 4))
    try file.seek(toOffset: 0)
    var header = Data()
    func word(_ value: Int) { var v = UInt16(truncatingIfNeeded: value).littleEndian; header.append(Data(bytes: &v, count: 2)) }
    func dword(_ value: Int) { var v = UInt32(truncatingIfNeeded: value).littleEndian; header.append(Data(bytes: &v, count: 4)) }
    header.append(contentsOf: "RIFF".utf8); dword(Int(36 + frames * 4)); header.append(contentsOf: "WAVEfmt ".utf8)
    dword(16); word(1); word(2); dword(rate); dword(rate * 4); word(4); word(16)
    header.append(contentsOf: "data".utf8); dword(Int(frames * 4))
    try file.write(contentsOf: header)
    try file.close()
  }

  func cancel() { try? file.close(); try? FileManager.default.removeItem(at: url) }
}

final class SaviasoundVideoView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate {
  private struct SignalVertex {
    let time: Double
    let value: Double
    let segment: Int
    let a: Double
    let b: Double
    let c: Double
  }

  static weak var active: SaviasoundVideoView?
  private let session = AVCaptureSession()
  private let cameraQueue = DispatchQueue(label: "com.saviasound.video.camera")
  private let fileQueue = DispatchQueue(label: "com.saviasound.video.file")
  private let preview = AVCaptureVideoPreviewLayer()
  private let overlayLock = NSLock()
  private lazy var logoImage: UIImage? = {
    guard let path = Bundle.main.path(forResource: "saviasound-logo", ofType: "png") else { return nil }
    return UIImage(contentsOfFile: path)?.withTintColor(UIColor(red: 248.0 / 255, green: 245.0 / 255,
      blue: 238.0 / 255, alpha: 1), renderingMode: .alwaysOriginal)
  }()
  private var vertices: [SignalVertex] = []
  private var mood = ""
  private var tint = UIColor.white
  private var delayMs = 0.0
  private var anchorPerfMs = 0.0
  private var overlayAt = 0.0
  private var graphCenter = Double.nan
  private var graphRange = 1.0
  private var graphAt = 0.0
  private var bannerOpacity = 0.0
  private var bannerAt = 0.0
  private var greetingAt = 0.0
  private var writer: AVAssetWriter?
  private var input: AVAssetWriterInput?
  private var adaptor: AVAssetWriterInputPixelBufferAdaptor?
  private var firstTime: CMTime?
  private var lastTime: CMTime?
  private var videoURL: URL?
  private var wav: SaviaWavFile?
  private var rate = 48_000
  private var cameraConfigured = false
  private var startPromise: Promise?
  private var stopPromise: Promise?
  private var recording = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    preview.session = session
    preview.videoGravity = .resizeAspectFill
    layer.addSublayer(preview)
    cameraQueue.async { self.configureCamera() }
  }

  override func layoutSubviews() { super.layoutSubviews(); preview.frame = bounds }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      SaviasoundVideoView.active = self
      cameraQueue.async { if !self.session.isRunning { self.session.startRunning() } }
    } else {
      if SaviasoundVideoView.active === self { SaviasoundVideoView.active = nil }
      cameraQueue.async { if self.session.isRunning { self.session.stopRunning() } }
    }
  }

  private func configureCamera() {
    session.beginConfiguration()
    session.automaticallyConfiguresApplicationAudioSession = false
    session.sessionPreset = .hd1920x1080
    defer { session.commitConfiguration() }
    guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
      let cameraInput = try? AVCaptureDeviceInput(device: device), session.canAddInput(cameraInput) else { return }
    session.addInput(cameraInput)
    let output = AVCaptureVideoDataOutput()
    output.alwaysDiscardsLateVideoFrames = true
    output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
    output.setSampleBufferDelegate(self, queue: fileQueue)
    guard session.canAddOutput(output) else { return }
    session.addOutput(output)
    cameraConfigured = true
    if let connection = output.connection(with: .video) {
      if #available(iOS 17.0, *) {
        if connection.isVideoRotationAngleSupported(90) { connection.videoRotationAngle = 90 }
      } else if connection.isVideoOrientationSupported {
        connection.videoOrientation = .portrait
      }
    }
  }

  func setOverlay(_ values: [Double], mood: String, color: Int, delayMs: Double,
    sampledAtPerfMs: Double, sentAtWallMs: Double) {
    var parsed: [SignalVertex] = []
    parsed.reserveCapacity(values.count / 6)
    for i in stride(from: 0, to: values.count - 5, by: 6) {
      parsed.append(SignalVertex(time: values[i], value: values[i + 1], segment: Int(values[i + 2]),
        a: values[i + 3], b: values[i + 4], c: values[i + 5]))
    }
    let receivedAt = ProcessInfo.processInfo.systemUptime
    let bridgeMs = Date().timeIntervalSince1970 * 1000 - sentAtWallMs
    overlayLock.lock()
    vertices = parsed; self.mood = mood
    tint = UIColor(red: CGFloat((color >> 16) & 255) / 255, green: CGFloat((color >> 8) & 255) / 255,
                   blue: CGFloat(color & 255) / 255, alpha: 1)
    self.delayMs = max(0, delayMs)
    anchorPerfMs = sampledAtPerfMs + bridgeMs
    overlayAt = receivedAt
    overlayLock.unlock()
  }

  func greet() {
    overlayLock.lock()
    greetingAt = ProcessInfo.processInfo.systemUptime
    overlayLock.unlock()
  }

  private func valueAt(_ vertices: [SignalVertex], time: Double) -> Double? {
    guard !vertices.isEmpty, time >= vertices[0].time else { return nil }
    var low = 0, high = vertices.count - 1
    while low < high {
      let middle = (low + high + 1) / 2
      if vertices[middle].time <= time { low = middle } else { high = middle - 1 }
    }
    let point = vertices[low]
    if time == point.time { return point.value }
    guard low + 1 < vertices.count else { return nil }
    let next = vertices[low + 1], duration = next.time - point.time
    guard next.segment == point.segment, duration > 0 else { return nil }
    let u = (time - point.time) / duration
    return point.value + u * (point.c + u * (point.b + u * point.a))
  }

  func start(rate: Int, promise: Promise) {
    guard !recording else { promise.reject("BUSY", "Ya hay una grabación."); return }
    guard cameraConfigured else { promise.reject("CAMERA_NOT_READY", "Espera a que se abra la cámara."); return }
    self.rate = rate
    let folder = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("saviasound-videos", isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      let stamp = Int(Date().timeIntervalSince1970 * 1000)
      videoURL = folder.appendingPathComponent("saviasound-\(stamp)-camera.mp4")
      wav = try SaviaWavFile(url: folder.appendingPathComponent("saviasound-\(stamp)-audio.wav"), rate: rate)
      startPromise = promise
      recording = true
    } catch { promise.reject("FILE_ERROR", error.localizedDescription) }
  }

  func appendAudio(atFrame: Int64, data: Data) { try? wav?.append(atFrame: atFrame, data: data) }

  func stop(promise: Promise) {
    guard recording else { promise.reject("NOT_RECORDING", "No hay una grabación activa."); return }
    recording = false
    stopPromise = promise
    fileQueue.async {
      guard let writer = self.writer, writer.status == .writing,
        let first = self.firstTime, let last = self.lastTime else {
        self.stopPromise?.reject("EMPTY_VIDEO", "La grabación no contiene vídeo.")
        self.cleanup()
        return
      }
      self.input?.markAsFinished()
      writer.finishWriting {
        if writer.status == .completed {
          let seconds = max(0.1, CMTimeGetSeconds(CMTimeSubtract(last, first)))
          self.export(duration: seconds)
        } else {
          self.stopPromise?.reject("VIDEO_ERROR", writer.error?.localizedDescription ?? "No se pudo guardar el vídeo.")
          self.cleanup()
        }
      }
    }
  }

  func captureOutput(_ output: AVCaptureOutput, didOutput sample: CMSampleBuffer, from connection: AVCaptureConnection) {
    guard recording, let source = CMSampleBufferGetImageBuffer(sample), let url = videoURL else { return }
    let time = CMSampleBufferGetPresentationTimeStamp(sample)
    if writer == nil {
      do {
        let width = CVPixelBufferGetWidth(source), height = CVPixelBufferGetHeight(source)
        let newWriter = try AVAssetWriter(outputURL: url, fileType: .mp4)
        let video = AVAssetWriterInput(mediaType: .video, outputSettings: [
          AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height,
          AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 12_000_000,
                                            AVVideoExpectedSourceFrameRateKey: 30]
        ])
        video.expectsMediaDataInRealTime = true
        let pixelAdaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: video,
          sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                                        kCVPixelBufferWidthKey as String: width, kCVPixelBufferHeightKey as String: height])
        guard newWriter.canAdd(video) else { throw NSError(domain: "SaviasoundVideo", code: 1) }
        newWriter.add(video)
        guard newWriter.startWriting() else { throw newWriter.error ?? NSError(domain: "SaviasoundVideo", code: 2) }
        newWriter.startSession(atSourceTime: time)
        writer = newWriter; input = video; adaptor = pixelAdaptor; firstTime = time
        startPromise?.resolve(nil); startPromise = nil
      } catch { startPromise?.reject("VIDEO_ERROR", error.localizedDescription); startPromise = nil; recording = false; cleanup(); return }
    }
    guard input?.isReadyForMoreMediaData == true, let pool = adaptor?.pixelBufferPool else { return }
    var destination: CVPixelBuffer?
    guard CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &destination) == kCVReturnSuccess,
      let dest = destination else { return }
    CVPixelBufferLockBaseAddress(source, .readOnly)
    CVPixelBufferLockBaseAddress(dest, [])
    if let sourceBase = CVPixelBufferGetBaseAddress(source), let destBase = CVPixelBufferGetBaseAddress(dest) {
      let rows = CVPixelBufferGetHeight(source)
      let bytes = min(CVPixelBufferGetBytesPerRow(source), CVPixelBufferGetBytesPerRow(dest))
      for row in 0..<rows {
        memcpy(destBase.advanced(by: row * CVPixelBufferGetBytesPerRow(dest)),
               sourceBase.advanced(by: row * CVPixelBufferGetBytesPerRow(source)), bytes)
      }
      drawOverlay(on: dest)
    }
    CVPixelBufferUnlockBaseAddress(dest, [])
    CVPixelBufferUnlockBaseAddress(source, .readOnly)
    if adaptor?.append(dest, withPresentationTime: time) == true { lastTime = time }
  }

  private func drawOverlay(on buffer: CVPixelBuffer) {
    guard let base = CVPixelBufferGetBaseAddress(buffer) else { return }
    let width = CVPixelBufferGetWidth(buffer), height = CVPixelBufferGetHeight(buffer)
    guard let context = CGContext(data: base, width: width, height: height, bitsPerComponent: 8,
      bytesPerRow: CVPixelBufferGetBytesPerRow(buffer), space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue) else { return }
    overlayLock.lock()
    let currentVertices = vertices, name = mood, color = tint
    let currentDelayMs = delayMs, currentAnchorPerfMs = anchorPerfMs, receivedAt = overlayAt
    let currentGreetingAt = greetingAt
    overlayLock.unlock()
    let now = ProcessInfo.processInfo.systemUptime
    let greetingAgeMs = (now - currentGreetingAt) * 1000
    let glowOpacity: Double
    if currentGreetingAt == 0 || greetingAgeMs < 0 || greetingAgeMs >= 1030 { glowOpacity = 0 }
    else if greetingAgeMs < 180 {
      let progress = greetingAgeMs / 180
      glowOpacity = 0.32 * progress * progress * (3 - 2 * progress)
    } else {
      let progress = (greetingAgeMs - 180) / 850
      glowOpacity = 0.32 * (1 - progress * progress * (3 - 2 * progress))
    }
    let signalAgeMs = currentVertices.last.map { currentAnchorPerfMs + (now - receivedAt) * 1000 - $0.time }
      ?? .infinity
    let targetOpacity = signalAgeMs < 10_000 ? 1.0 : 0.0
    let fadeStep = bannerAt == 0 ? 0 : min(1, max(0, (now - bannerAt) / 0.65))
    bannerOpacity = targetOpacity > bannerOpacity
      ? min(targetOpacity, bannerOpacity + fadeStep) : max(targetOpacity, bannerOpacity - fadeStep)
    bannerAt = now
    guard bannerOpacity > 0 else { return }
    context.saveGState()
    context.setAlpha(CGFloat(bannerOpacity))
    context.translateBy(x: 0, y: CGFloat(height)); context.scaleBy(x: 1, y: -1)
    let w = CGFloat(width), h = CGFloat(height)
    context.setFillColor(UIColor(red: 18.0 / 255, green: 32.0 / 255, blue: 25.0 / 255, alpha: 0.72).cgColor)
    context.fill(CGRect(x: 0, y: h * 0.68, width: w, height: h * 0.32))
    context.setStrokeColor(UIColor.white.withAlphaComponent(0.16).cgColor)
    context.setLineWidth(1)
    context.move(to: CGPoint(x: 0, y: h * 0.68)); context.addLine(to: CGPoint(x: w, y: h * 0.68))
    context.strokePath()
    let left = w * 0.05, top = h * 0.744
    let chartWidth = w * 0.90, chartHeight = h * 0.176
    context.setStrokeColor(UIColor.white.withAlphaComponent(0.13).cgColor)
    context.move(to: CGPoint(x: left, y: top + chartHeight / 2))
    context.addLine(to: CGPoint(x: left + chartWidth, y: top + chartHeight / 2))
    context.strokePath()
    context.setLineCap(.round); context.setLineJoin(.round)
    context.saveGState()
    context.clip(to: CGRect(x: left, y: top, width: chartWidth, height: chartHeight))
    if let latest = currentVertices.last {
      let end = min(latest.time, currentAnchorPerfMs + (now - receivedAt) * 1000 - currentDelayMs)
      let start = end - 8000
      var samples: [(Double, Double)?] = []
      samples.reserveCapacity(161)
      var sum = 0.0, count = 0
      var time = ceil(start / 50) * 50
      while time <= end && samples.count < 161 {
        if let value = valueAt(currentVertices, time: time) {
          samples.append(((time - start) / 8000, value))
          sum += value; count += 1
        } else { samples.append(nil) }
        time += 50
      }
      if count > 0 {
        let elapsedMs = graphAt == 0 ? 0 : min(250, max(0, (now - graphAt) * 1000))
        let targetCenter = sum / Double(count)
        graphCenter = graphCenter.isNaN ? targetCenter :
          graphCenter + (targetCenter - graphCenter) * (1 - exp(-elapsedMs / 3000))
        let peak = max(0.01, samples.compactMap { $0 }.map { abs($0.1 - graphCenter) }.max() ?? 0.01)
        let targetRange = peak * 1.18
        if graphAt == 0 { graphRange = targetRange }
        else {
          let speed = targetRange > graphRange ? 650.0 : 1800.0
          graphRange += (targetRange - graphRange) * (1 - exp(-elapsedMs / speed))
        }
        graphAt = now
        func trace() {
          var drawing = false
          for sample in samples {
            guard let (x, value) = sample else { drawing = false; continue }
            let normalizedY = min(0.97, max(0.03, 0.5 + (value - graphCenter) * 0.42 / graphRange))
            let point = CGPoint(x: left + chartWidth * x, y: top + chartHeight * normalizedY)
            if drawing { context.addLine(to: point) } else { context.move(to: point) }
            drawing = true
          }
        }
        if glowOpacity > 0 {
          trace()
          context.setStrokeColor(color.withAlphaComponent(CGFloat(glowOpacity)).cgColor)
          context.setLineWidth(w * 0.008)
          context.strokePath()
        }
        context.setStrokeColor(color.cgColor)
        context.setLineWidth(w * 0.0025)
        trace()
        context.strokePath()
      }
    } else {
      graphCenter = .nan
      graphAt = 0
    }
    context.restoreGState()
    let live = "SEÑAL VIVA" as NSString
    let liveStyle: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: w * 0.018, weight: .semibold),
      .foregroundColor: UIColor.white.withAlphaComponent(0.72)]
    let font = UIFont.systemFont(ofSize: w * 0.031, weight: .semibold)
    let moodStyle: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor.white]
    UIGraphicsPushContext(context)
    if let logoImage {
      let logoWidth = w * 0.20
      logoImage.draw(in: CGRect(x: left, y: h * 0.694, width: logoWidth,
        height: logoWidth * logoImage.size.height / logoImage.size.width))
    }
    let liveWidth = live.size(withAttributes: liveStyle).width
    live.draw(at: CGPoint(x: left + chartWidth - liveWidth, y: h * 0.697), withAttributes: liveStyle)
    let nameText = name as NSString
    nameText.draw(at: CGPoint(x: (w - nameText.size(withAttributes: moodStyle).width) / 2, y: h * 0.948),
      withAttributes: moodStyle)
    UIGraphicsPopContext()
    context.setFillColor(color.cgColor)
    context.fillEllipse(in: CGRect(x: left + chartWidth - liveWidth - w * 0.018, y: h * 0.701,
      width: w * 0.008, height: w * 0.008))
    context.restoreGState()
  }

  private func export(duration: Double) {
    guard let videoURL, let wav else { cleanup(); return }
    do {
      try wav.finish(durationFrames: Int64(duration * Double(rate)))
      let videoAsset = AVURLAsset(url: videoURL), audioAsset = AVURLAsset(url: wav.url)
      let composition = AVMutableComposition()
      guard let sourceVideo = videoAsset.tracks(withMediaType: .video).first,
        let sourceAudio = audioAsset.tracks(withMediaType: .audio).first,
        let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
        let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
        throw NSError(domain: "SaviasoundVideo", code: 3)
      }
      try videoTrack.insertTimeRange(CMTimeRange(start: .zero, duration: videoAsset.duration), of: sourceVideo, at: .zero)
      try audioTrack.insertTimeRange(CMTimeRange(start: .zero, duration: audioAsset.duration), of: sourceAudio, at: .zero)
      videoTrack.preferredTransform = sourceVideo.preferredTransform
      let output = videoURL.deletingLastPathComponent().appendingPathComponent("saviasound-\(Int(Date().timeIntervalSince1970)).mp4")
      guard let session = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
        throw NSError(domain: "SaviasoundVideo", code: 4)
      }
      session.outputURL = output; session.outputFileType = .mp4
      session.exportAsynchronously {
        if session.status == .completed { self.stopPromise?.resolve(output.absoluteString) }
        else { self.stopPromise?.reject("EXPORT_ERROR", session.error?.localizedDescription ?? "No se pudo crear el MP4.") }
        self.cleanup()
      }
    } catch { stopPromise?.reject("EXPORT_ERROR", error.localizedDescription); cleanup() }
  }

  private func cleanup() {
    try? videoURL.map { try FileManager.default.removeItem(at: $0) }
    wav?.cancel()
    writer = nil; input = nil; adaptor = nil; firstTime = nil; lastTime = nil
    videoURL = nil; wav = nil; startPromise = nil; stopPromise = nil
  }
}

public final class SaviasoundVideoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SaviasoundVideo")
    View(SaviasoundVideoView.self) {}
    AsyncFunction("start") { (rate: Int, promise: Promise) in
      guard let view = SaviasoundVideoView.active else { promise.reject("CAMERA_NOT_READY", "Abre la cámara antes de grabar."); return }
      view.start(rate: rate, promise: promise)
    }.runOnQueue(.main)
    AsyncFunction("stop") { (promise: Promise) in
      guard let view = SaviasoundVideoView.active else { promise.reject("CAMERA_NOT_READY", "La cámara no está disponible."); return }
      view.stop(promise: promise)
    }.runOnQueue(.main)
    Function("setOverlay") { (vertices: [Double], mood: String, color: Int, delayMs: Double,
      sampledAtPerfMs: Double, sentAtWallMs: Double) in
      SaviasoundVideoView.active?.setOverlay(vertices, mood: mood, color: color, delayMs: delayMs,
        sampledAtPerfMs: sampledAtPerfMs, sentAtWallMs: sentAtWallMs)
    }
    Function("greet") { SaviasoundVideoView.active?.greet() }
    Function("appendAudio") { (atFrame: Double, pcm: Data) in
      SaviasoundVideoView.active?.appendAudio(atFrame: Int64(atFrame), data: pcm)
    }
    AsyncFunction("save") { (uri: String, promise: Promise) in
      guard let url = URL(string: uri), url.isFileURL, FileManager.default.fileExists(atPath: url.path) else {
        promise.reject("SAVE_ERROR", "El vídeo ya no está disponible.")
        return
      }
      PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
        guard status == .authorized || status == .limited else {
          promise.reject("SAVE_PERMISSION", "Permite guardar vídeos en Fotos para continuar.")
          return
        }
        PHPhotoLibrary.shared().performChanges({
          PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
        }, completionHandler: { saved, error in
          if saved { promise.resolve(nil) }
          else { promise.reject("SAVE_ERROR", error?.localizedDescription ?? "No se pudo guardar el vídeo.") }
        })
      }
    }
  }
}
