package expo.modules.plantiapcm

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PlantiaPcmModule : Module() {
  companion object { init { System.loadLibrary("plantia_pcm") } }
  private external fun createNative(rate: Double): Int
  private external fun destroyNative(id: Int)
  private external fun configureNative(id: Int, values: DoubleArray)
  private external fun scheduleNative(id: Int, values: DoubleArray)
  private external fun sampleNative(id: Int, key: Int, data: ByteArray)
  private external fun loadSfzNative(id: Int, key: Int, lane: Int, path: String, gain: Double, tuning: Double)
  private external fun scheduleSfzNative(id: Int, time: Double, key: Int, note: Int, velocity: Int, duration: Double)
  private external fun retainNative(id: Int, keys: DoubleArray)
  private external fun renderNative(id: Int, frames: Int): ByteArray
  private external fun statusNative(id: Int): DoubleArray

  private val engines = mutableSetOf<Int>()

  override fun definition() = ModuleDefinition {
    Name("PlantiaPcm")
    Function("create") { rate: Double ->
      val context = requireNotNull(appContext.reactContext)
      context.startService(Intent(context, PlantiaPlaybackLifecycleService::class.java))
      createNative(rate).also { engines.add(it) }
    }
    Function("destroy") { id: Int ->
      destroyNative(id)
      engines.remove(id)
      if (engines.isEmpty()) appContext.reactContext?.let {
        it.stopService(Intent(it, PlantiaPlaybackLifecycleService::class.java))
      }
    }
    OnDestroy {
      engines.forEach { destroyNative(it) }
      engines.clear()
      appContext.reactContext?.let {
        it.stopService(Intent(it, PlantiaPlaybackLifecycleService::class.java))
      }
    }
    Function("configure") { id: Int, values: List<Double> -> configureNative(id, values.toDoubleArray()) }
    Function("schedule") { id: Int, values: List<Double> -> scheduleNative(id, values.toDoubleArray()) }
    Function("sample") { id: Int, key: Int, data: ByteArray -> sampleNative(id, key, data) }
    Function("loadSfz") { id: Int, key: Int, lane: Int, path: String, gain: Double, tuning: Double -> loadSfzNative(id, key, lane, path, gain, tuning) }
    Function("scheduleSfz") { id: Int, time: Double, key: Int, note: Int, velocity: Int, duration: Double ->
      scheduleSfzNative(id, time, key, note, velocity, duration)
    }
    Function("retain") { id: Int, keys: List<Double> -> retainNative(id, keys.toDoubleArray()) }
    Function("render") { id: Int, frames: Int -> renderNative(id, frames) }
    Function("status") { id: Int -> statusNative(id).toList() }
  }
}
