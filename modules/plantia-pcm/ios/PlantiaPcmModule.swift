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
    Function("retain") { (id: Int, keys: [Double]) in
      PlantiaPcmBridge.retainSamples(NSNumber(value: id), keys: keys.map { NSNumber(value: $0) })
    }
    Function("render") { (id: Int, frames: Int) in
      PlantiaPcmBridge.render(NSNumber(value: id), frames: frames)
    }
    Function("status") { (id: Int) in PlantiaPcmBridge.status(NSNumber(value: id)).map { $0.doubleValue } }
  }
}
