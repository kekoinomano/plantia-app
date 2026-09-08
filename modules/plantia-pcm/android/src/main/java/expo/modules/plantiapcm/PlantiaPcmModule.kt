package expo.modules.plantiapcm

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PlantiaPcmModule : Module() {
  companion object { init { System.loadLibrary("plantia_pcm") } }
  private external fun createNative(rate: Double): Int
  private external fun destroyNative(id: Int)
  private external fun configureNative(id: Int, values: DoubleArray)
  private external fun scheduleNative(id: Int, values: DoubleArray)
  private external fun sampleNative(id: Int, key: Int, data: ByteArray)
  private external fun retainNative(id: Int, keys: DoubleArray)
  private external fun renderNative(id: Int, frames: Int): ByteArray
  private external fun statusNative(id: Int): DoubleArray

  override fun definition() = ModuleDefinition {
    Name("PlantiaPcm")
    Function("create") { rate: Double -> createNative(rate) }
    Function("destroy") { id: Int -> destroyNative(id) }
    Function("configure") { id: Int, values: List<Double> -> configureNative(id, values.toDoubleArray()) }
    Function("schedule") { id: Int, values: List<Double> -> scheduleNative(id, values.toDoubleArray()) }
    Function("sample") { id: Int, key: Int, data: ByteArray -> sampleNative(id, key, data) }
    Function("retain") { id: Int, keys: List<Double> -> retainNative(id, keys.toDoubleArray()) }
    Function("render") { id: Int, frames: Int -> renderNative(id, frames) }
    Function("status") { id: Int -> statusNative(id).toList() }
  }
}
