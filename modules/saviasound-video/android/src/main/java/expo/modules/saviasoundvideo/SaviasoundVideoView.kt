package expo.modules.saviasoundvideo

import android.content.Context
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffColorFilter
import android.graphics.RectF
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.widget.LinearLayout
import androidx.camera.core.CameraEffect
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.core.UseCaseGroup
import androidx.camera.effects.OverlayEffect
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.transformer.Composition
import androidx.media3.transformer.AudioEncoderSettings
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.views.ExpoView
import java.io.File
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min

@androidx.annotation.OptIn(UnstableApi::class)
class SaviasoundVideoView(context: Context, private val expoContext: AppContext) : ExpoView(context, expoContext) {
  override val shouldUseAndroidLayout = true
  private val preview = PreviewView(context).apply { implementationMode = PreviewView.ImplementationMode.COMPATIBLE }
  private val logo by lazy { BitmapFactory.decodeResource(resources, R.drawable.saviasound_logo) }
  private val executor = ContextCompat.getMainExecutor(context)
  private var provider: ProcessCameraProvider? = null
  private var capture: VideoCapture<Recorder>? = null
  private var recording: Recording? = null
  private var startPromise: Promise? = null
  private var stopPromise: Promise? = null
  private var wav: WavFile? = null
  private var rate = 48000
  private var rawVideo: File? = null
  private var rawAudio: File? = null
  @Volatile private var overlay = Overlay(emptyList(), "", Color.WHITE, 0.0, 0.0, 0L)
  private var graphCenter = Double.NaN
  private var graphRange = 1.0
  private var graphAtNanos = 0L
  private var bannerOpacity = 0.0
  private var bannerAtNanos = 0L
  @Volatile private var greetingAtNanos = 0L

  data class Vertex(val time: Double, val value: Double, val segment: Int,
    val a: Double, val b: Double, val c: Double)
  data class Overlay(val vertices: List<Vertex>, val mood: String, val color: Int,
    val delayMs: Double, val anchorPerfMs: Double, val receivedAtNanos: Long)

  private fun valueAt(vertices: List<Vertex>, time: Double): Double? {
    if (vertices.isEmpty() || time < vertices[0].time) return null
    var low = 0
    var high = vertices.lastIndex
    while (low < high) {
      val mid = (low + high + 1) / 2
      if (vertices[mid].time <= time) low = mid else high = mid - 1
    }
    val point = vertices[low]
    if (time == point.time) return point.value
    val next = vertices.getOrNull(low + 1) ?: return null
    val duration = next.time - point.time
    if (next.segment != point.segment || duration <= 0.0) return null
    val u = (time - point.time) / duration
    return point.value + u * (point.c + u * (point.b + u * point.a))
  }

  init { addView(preview, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)) }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    active = this
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      try {
        provider = future.get()
        bindCamera()
      } catch (error: Throwable) { startPromise?.reject("CAMERA_ERROR", error.message ?: "No se pudo abrir la cámara.", error); startPromise = null }
    }, executor)
  }

  override fun onDetachedFromWindow() {
    if (active === this) active = null
    provider?.unbindAll()
    super.onDetachedFromWindow()
  }

  private fun bindCamera() {
    val owner = expoContext.currentActivity as? LifecycleOwner ?: error("Cámara no disponible.")
    val cameraPreview = Preview.Builder().build().apply { surfaceProvider = preview.surfaceProvider }
    val recorder = Recorder.Builder()
      .setQualitySelector(QualitySelector.from(Quality.FHD, FallbackStrategy.lowerQualityOrHigherThan(Quality.FHD)))
      .setTargetVideoEncodingBitRate(12_000_000)
      .build()
    val video = VideoCapture.withOutput(recorder)
    val effect = OverlayEffect(CameraEffect.VIDEO_CAPTURE, 0, Handler(overlayThread.looper), {})
    effect.setOnDrawListener { frame ->
      val data = overlay
      val canvas = frame.overlayCanvas
      canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
      val nowNanos = SystemClock.elapsedRealtimeNanos()
      val signalAgeMs = data.vertices.lastOrNull()?.let {
        data.anchorPerfMs + (nowNanos - data.receivedAtNanos) / 1_000_000.0 - it.time
      } ?: Double.POSITIVE_INFINITY
      val targetOpacity = if (signalAgeMs < 10_000.0) 1.0 else 0.0
      val fadeStep = if (bannerAtNanos == 0L) 0.0 else
        ((nowNanos - bannerAtNanos) / 650_000_000.0).coerceIn(0.0, 1.0)
      bannerOpacity = if (targetOpacity > bannerOpacity)
        min(targetOpacity, bannerOpacity + fadeStep) else max(targetOpacity, bannerOpacity - fadeStep)
      bannerAtNanos = nowNanos
      if (bannerOpacity <= 0.0) return@setOnDrawListener true
      val bounds = frame.cropRect
      val saved = canvas.save()
      val rotation = frame.rotationDegrees
      when (rotation) {
        90 -> { canvas.translate(bounds.left.toFloat(), bounds.bottom.toFloat()); canvas.rotate(-90f) }
        180 -> { canvas.translate(bounds.right.toFloat(), bounds.bottom.toFloat()); canvas.rotate(180f) }
        270 -> { canvas.translate(bounds.right.toFloat(), bounds.top.toFloat()); canvas.rotate(90f) }
        else -> canvas.translate(bounds.left.toFloat(), bounds.top.toFloat())
      }
      val width = if (rotation == 90 || rotation == 270) bounds.height().toFloat() else bounds.width().toFloat()
      val height = if (rotation == 90 || rotation == 270) bounds.width().toFloat() else bounds.height().toFloat()
      val left = width * 0.05f
      val right = width * 0.95f
      val bandTop = height * 0.68f
      val fadeLayer = canvas.saveLayerAlpha(0f, bandTop, width, height, (bannerOpacity * 255).toInt())
      canvas.drawRect(0f, bandTop, width, height,
        Paint().apply { color = Color.argb(184, 18, 32, 25) })
      val rule = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(40, 255, 255, 255); strokeWidth = 1f }
      canvas.drawLine(0f, bandTop, width, bandTop, rule)
      logo?.let { bitmap ->
        val logoWidth = width * 0.20f
        val logoHeight = logoWidth * bitmap.height / bitmap.width
        canvas.drawBitmap(bitmap, null,
          RectF(left, height * 0.694f, left + logoWidth, height * 0.694f + logoHeight),
          Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply {
            colorFilter = PorterDuffColorFilter(Color.rgb(248, 245, 238), PorterDuff.Mode.SRC_IN)
          })
      }
      val live = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(184, 248, 245, 238); textSize = width * 0.018f; textAlign = Paint.Align.RIGHT
        typeface = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.BOLD)
      }
      canvas.drawText("SEÑAL VIVA", right, height * 0.712f, live)
      canvas.drawCircle(right - live.measureText("SEÑAL VIVA") - width * 0.014f,
        height * 0.706f, width * 0.004f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = data.color })
      val top = height * 0.744f
      val bottom = height * 0.92f
      canvas.drawLine(left, (top + bottom) / 2, right, (top + bottom) / 2,
        Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(33, 255, 255, 255); strokeWidth = 1f })
      val path = Path()
      if (data.vertices.isNotEmpty()) {
        val end = min(data.vertices.last().time,
          data.anchorPerfMs + (nowNanos - data.receivedAtNanos) / 1_000_000.0 - data.delayMs)
        val start = end - 8000.0
        val samples = ArrayList<Pair<Float, Double>?>(161)
        var sum = 0.0
        var count = 0
        var sampleTime = ceil(start / 50.0) * 50.0
        while (sampleTime <= end && samples.size < 161) {
          val value = valueAt(data.vertices, sampleTime)
          if (value == null) samples.add(null) else {
            samples.add(Pair(((sampleTime - start) / 8000.0).toFloat(), value))
            sum += value
            count++
          }
          sampleTime += 50.0
        }
        if (count > 0) {
          val elapsedMs = if (graphAtNanos == 0L) 0.0 else
            ((nowNanos - graphAtNanos) / 1_000_000.0).coerceIn(0.0, 250.0)
          val targetCenter = sum / count
          graphCenter = if (graphCenter.isNaN()) targetCenter else
            graphCenter + (targetCenter - graphCenter) * (1.0 - exp(-elapsedMs / 3000.0))
          val peak = max(0.01, samples.filterNotNull().maxOf { abs(it.second - graphCenter) })
          val targetRange = peak * 1.18
          graphRange = if (graphAtNanos == 0L) targetRange else {
            val speed = if (targetRange > graphRange) 650.0 else 1800.0
            graphRange + (targetRange - graphRange) * (1.0 - exp(-elapsedMs / speed))
          }
          graphAtNanos = nowNanos
          var drawing = false
          for (sample in samples) {
            if (sample == null) { drawing = false; continue }
            val x = left + (right - left) * sample.first
            val y = top + (bottom - top) *
              (0.5 + (sample.second - graphCenter) * 0.42 / graphRange).coerceIn(0.03, 0.97).toFloat()
            if (drawing) path.lineTo(x, y) else path.moveTo(x, y)
            drawing = true
          }
        }
      } else {
        graphCenter = Double.NaN
        graphAtNanos = 0L
      }
      val line = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = data.color; style = Paint.Style.STROKE
        strokeWidth = width * 0.0025f; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
      }
      val greetingAgeMs = (nowNanos - greetingAtNanos) / 1_000_000.0
      val glowOpacity = when {
        greetingAtNanos == 0L || greetingAgeMs < 0.0 || greetingAgeMs >= 1030.0 -> 0.0
        greetingAgeMs < 180.0 -> {
          val progress = greetingAgeMs / 180.0
          0.32 * progress * progress * (3.0 - 2.0 * progress)
        }
        else -> {
          val progress = (greetingAgeMs - 180.0) / 850.0
          0.32 * (1.0 - progress * progress * (3.0 - 2.0 * progress))
        }
      }
      val clipped = canvas.save()
      canvas.clipRect(left, top, right, bottom)
      if (glowOpacity > 0.0) {
        val glow = Paint(line).apply { alpha = (glowOpacity * 255).toInt(); strokeWidth = width * 0.008f }
        canvas.drawPath(path, glow)
      }
      canvas.drawPath(path, line)
      canvas.restoreToCount(clipped)
      val label = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE; textSize = width * 0.031f; textAlign = Paint.Align.CENTER
        typeface = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.BOLD)
      }
      canvas.drawText(data.mood, width / 2, height * 0.971f, label)
      canvas.restoreToCount(fadeLayer)
      canvas.restoreToCount(saved)
      true
    }
    provider?.unbindAll()
    provider?.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA,
      UseCaseGroup.Builder().addUseCase(cameraPreview).addUseCase(video).addEffect(effect).build())
    capture = video
  }

  fun setOverlay(vertices: List<Double>, mood: String, color: Int, delayMs: Double,
    sampledAtPerfMs: Double, sentAtWallMs: Double) {
    val parsed = ArrayList<Vertex>(vertices.size / 6)
    var index = 0
    while (index + 5 < vertices.size) {
      parsed.add(Vertex(vertices[index], vertices[index + 1], vertices[index + 2].toInt(),
        vertices[index + 3], vertices[index + 4], vertices[index + 5]))
      index += 6
    }
    val receivedAtNanos = SystemClock.elapsedRealtimeNanos()
    val bridgeMs = System.currentTimeMillis().toDouble() - sentAtWallMs
    overlay = Overlay(parsed, mood, color or -0x1000000, delayMs.coerceAtLeast(0.0),
      sampledAtPerfMs + bridgeMs, receivedAtNanos)
  }

  fun greet() { greetingAtNanos = SystemClock.elapsedRealtimeNanos() }

  fun start(sampleRate: Int, promise: Promise) {
    if (recording != null || startPromise != null) { promise.reject("BUSY", "Ya hay una grabación.", null); return }
    val video = capture ?: run { promise.reject("CAMERA_NOT_READY", "Espera a que se abra la cámara.", null); return }
    rate = sampleRate
    val stamp = System.currentTimeMillis()
    rawVideo = File(context.cacheDir, "saviasound-$stamp-video.mp4")
    rawAudio = File(context.cacheDir, "saviasound-$stamp-audio.wav")
    wav = WavFile(rawAudio!!, rate)
    startPromise = promise
    recording = video.output.prepareRecording(context, FileOutputOptions.Builder(rawVideo!!).build())
      .start(executor) { event ->
        when (event) {
          is VideoRecordEvent.Start -> { startPromise?.resolve(null); startPromise = null }
          is VideoRecordEvent.Finalize -> {
            recording = null
            val started = startPromise
            startPromise = null
            if (event.hasError()) {
              val message = "No se pudo grabar el vídeo (${event.error})."
              started?.reject("CAMERA_ERROR", message, null)
              stopPromise?.reject("CAMERA_ERROR", message, null)
              stopPromise = null
              wav?.cancel(); wav = null
              rawVideo?.delete()
            } else {
              started?.resolve(null)
              val promiseToStop = stopPromise
              stopPromise = null
              if (promiseToStop != null) export(event.recordingStats.recordedDurationNanos, promiseToStop)
            }
          }
        }
      }
  }

  fun appendAudio(atFrame: Long, pcm: ByteArray) { wav?.append(atFrame, pcm) }

  fun stop(promise: Promise) {
    val current = recording ?: run { promise.reject("NOT_RECORDING", "No hay una grabación activa.", null); return }
    stopPromise = promise
    current.stop()
  }

  private fun export(durationNanos: Long, promise: Promise) {
    val video = requireNotNull(rawVideo)
    val audio = requireNotNull(rawAudio)
    try {
      wav?.finish(durationNanos * rate / 1_000_000_000)
      wav = null
      val folder = File(context.filesDir, "saviasound-videos").apply { mkdirs() }
      val output = File(folder, "saviasound-${System.currentTimeMillis()}.mp4")
      val composition = Composition.Builder(
        EditedMediaItemSequence.withVideoFrom(listOf(EditedMediaItem.Builder(MediaItem.fromUri(video.toURI().toString())).build())),
        EditedMediaItemSequence.withAudioFrom(listOf(EditedMediaItem.Builder(MediaItem.fromUri(audio.toURI().toString())).build()))
      ).build()
      val encoder = DefaultEncoderFactory.Builder(context)
        .setRequestedAudioEncoderSettings(AudioEncoderSettings.Builder().setBitrate(256_000).build()).build()
      Transformer.Builder(context).setVideoMimeType(MimeTypes.VIDEO_H264).setAudioMimeType(MimeTypes.AUDIO_AAC)
        .setEncoderFactory(encoder)
        .addListener(object : Transformer.Listener {
          override fun onCompleted(composition: Composition, exportResult: ExportResult) {
            video.delete(); audio.delete(); promise.resolve(android.net.Uri.fromFile(output).toString())
          }
          override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
            video.delete(); audio.delete(); output.delete()
            promise.reject("EXPORT_ERROR", exportException.message ?: "No se pudo crear el MP4.", exportException)
          }
        }).build().start(composition, output.absolutePath)
    } catch (error: Throwable) {
      video.delete(); audio.delete()
      promise.reject("EXPORT_ERROR", error.message ?: "No se pudo crear el MP4.", error)
    }
  }

  companion object {
    var active: SaviasoundVideoView? = null
    private val overlayThread by lazy { HandlerThread("SaviasoundVideoOverlay").apply { start() } }
  }
}
