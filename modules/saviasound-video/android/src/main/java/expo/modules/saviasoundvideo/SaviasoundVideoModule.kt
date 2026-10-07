package expo.modules.saviasoundvideo

import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SaviasoundVideoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SaviasoundVideo")
    View(SaviasoundVideoView::class) {}
    AsyncFunction("start") { rate: Int, promise: Promise ->
      val view = SaviasoundVideoView.active
      if (view == null) promise.reject("CAMERA_NOT_READY", "Abre la cámara antes de grabar.", null)
      else view.start(rate, promise)
    }.runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)
    AsyncFunction("stop") { promise: Promise ->
      val view = SaviasoundVideoView.active
      if (view == null) promise.reject("CAMERA_NOT_READY", "La cámara no está disponible.", null)
      else view.stop(promise)
    }.runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)
    Function("setOverlay") { vertices: List<Double>, mood: String, color: Int, delayMs: Double,
      sampledAtPerfMs: Double, sentAtWallMs: Double ->
      SaviasoundVideoView.active?.setOverlay(vertices, mood, color, delayMs, sampledAtPerfMs, sentAtWallMs)
    }
    Function("greet") { SaviasoundVideoView.active?.greet() }
    Function("appendAudio") { atFrame: Double, pcm: ByteArray ->
      SaviasoundVideoView.active?.appendAudio(atFrame.toLong(), pcm)
    }
    AsyncFunction("save") { uri: String, promise: Promise ->
      try {
        val context = requireNotNull(appContext.reactContext)
        val file = java.io.File(requireNotNull(Uri.parse(uri).path))
        require(file.exists()) { "El vídeo ya no está disponible." }
        val values = ContentValues().apply {
          put(MediaStore.Video.Media.DISPLAY_NAME, file.name)
          put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
          if (Build.VERSION.SDK_INT >= 29) {
            put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/saviasound")
            put(MediaStore.Video.Media.IS_PENDING, 1)
          }
        }
        val resolver = context.contentResolver
        val destination = requireNotNull(resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values))
        try {
          resolver.openOutputStream(destination)?.use { output -> file.inputStream().use { it.copyTo(output) } }
            ?: error("No se pudo abrir el destino del vídeo.")
          if (Build.VERSION.SDK_INT >= 29) {
            values.clear(); values.put(MediaStore.Video.Media.IS_PENDING, 0)
            resolver.update(destination, values, null, null)
          }
          promise.resolve(null)
        } catch (error: Throwable) {
          resolver.delete(destination, null, null)
          throw error
        }
      } catch (error: Throwable) {
        promise.reject("SAVE_ERROR", error.message ?: "No se pudo guardar el vídeo.", error)
      }
    }
  }
}
