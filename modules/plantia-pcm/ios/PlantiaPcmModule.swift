import Foundation
import ExpoModulesCore

public class PlantiaPcmModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PlantiaPcm")
    Function("create") { (rate: Double) in PlantiaPcmBridge.create(rate).intValue }
    Function("destroy") { (id: Int) in PlantiaPcmBridge.destroy(NSNumber(value: id)) }
    Function("configure") { (id: Int, values: [Double]) in
      PlantiaPcmBridge.configure(NSNumber(value: id), values: values.map { NSNumber(value: $0) })
    }
    Function("schedule") { (id: Int, values: [Double]) in
      PlantiaPcmBridge.schedule(NSNumber(value: id), values: values.map { NSNumber(value: $0) })
    }
    Function("sample") { (id: Int, key: Int, data: Data) in
      PlantiaPcmBridge.sample(NSNumber(value: id), key: NSNumber(value: key), data: data)
    }
    Function("loadSfz") { (id: Int, key: Int, lane: Int, path: String, gain: Double, tuning: Double) in
      PlantiaPcmBridge.loadSfz(NSNumber(value: id), key: NSNumber(value: key), lane: NSNumber(value: lane), path: path,
        gain: NSNumber(value: gain), tuning: NSNumber(value: tuning))
    }
    Function("scheduleSfz") { (id: Int, time: Double, key: Int, note: Int, velocity: Int, duration: Double) in
      PlantiaPcmBridge.scheduleSfz(NSNumber(value: id), time: NSNumber(value: time), key: NSNumber(value: key),
        note: NSNumber(value: note), velocity: NSNumber(value: velocity), duration: NSNumber(value: duration))
    }
    Function("retain") { (id: Int, keys: [Double]) in
      PlantiaPcmBridge.retainSamples(NSNumber(value: id), keys: keys.map { NSNumber(value: $0) })
    }
    Function("render") { (id: Int, frames: Int) in
      PlantiaPcmBridge.render(NSNumber(value: id), frames: frames)
    }
    Function("status") { (id: Int) in PlantiaPcmBridge.status(NSNumber(value: id)).map { $0.doubleValue } }
  }
}
