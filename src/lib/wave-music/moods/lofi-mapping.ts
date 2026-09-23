import { clamp, type WaveFrame } from '../features';
import { signalIdentity } from '../musical-field';

export type LofiCalibration = { lowMean: number; highMean: number; lowVariation: number; highVariation: number };
// Fixed global range from all four supplied recordings; never a per-plant min/max.
export const LOFI_CALIBRATION: LofiCalibration = { lowMean: 2, highMean: 40, lowVariation: .0005, highVariation: .4 };
const logPosition = (v: number, low: number, high: number) => clamp(Math.log(Math.max(low, v) / low) / Math.log(high / low));
export function lofiCoordinates(frame: WaveFrame, calibration = LOFI_CALIBRATION) {
  const identity = signalIdentity(frame.long);
  const mean = logPosition(frame.long.fit.mean, calibration.lowMean, calibration.highMean);
  const relative = frame.short.fittedRms / Math.max(1e-9, frame.short.fit.mean);
  const variation = logPosition(relative, calibration.lowVariation, calibration.highVariation);
  const speed = logPosition(identity.reference, .5, 90);
  const concentration = clamp(frame.short.concentration);
  const width = identity.width;
  return { mean, variation, relative, speed, concentration, width, bands: identity.bands,
    tempo: 64 + mean * 18 + (speed - .5) * 4,
    scene: mean < .24 ? 0 : mean < .76 ? 1 : 2,
    mode: width > .30 ? 1 : concentration > .6 ? 2 : 0,
    key: Math.min(4, Math.floor(clamp(mean * .7 + speed * .3) * 5)),
    groove: concentration > .65 ? 2 : width > .28 ? 1 : 0,
    route: variation > .65 ? 1 : 0,
    form: Math.min(3, Math.floor(clamp(width * .4 + variation * .35 + mean * .25) * 4)),
  };
}
