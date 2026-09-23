import type { Fit, Wave } from './analysis';

export const TAU = Math.PI * 2;
export const clamp = (x: number, low = 0, high = 1) => Math.max(low, Math.min(high, x));
export const wrap = (x: number, period = TAU) => ((x % period) + period) % period;
export type Component = Wave & {
  id: number; rank: number; weight: number; age: number;
  phaseAtEnd: number; period: number; slopeAmplitude: number;
  amplitudeChange: number; frequencyChange: number;
};
export type WindowFeatures = {
  fit: Fit; start: number; end: number; waves: Component[];
  rms: number; relativeRms: number; fittedRms: number; residualRatio: number;
  centroid: number; concentration: number; effectiveWaves: number;
  meanChange: number; persistence: number;
};
export type WaveFrame = {
  id: number; sequence: number; arrival: number; short: WindowFeatures; long: WindowFeatures;
  /** During the intro long aliases the measured short window, never a fake 8 s fit. */
  warmingUp?: boolean;
};

/** Marginal SSE improvement / total improvement, NOT amplitude squared:
 * irregularly sampled components need not be orthogonal. This weight describes
 * importance within the fit, never biological confidence. */
export function describe(fit: Fit, end: number, previous: WindowFeatures | null,
  identity: () => number): WindowFeatures {
  const total = fit.waves.reduce((sum, w) => sum + Math.max(0, w.improvement), 0);
  const available = new Set(previous?.waves ?? []);
  const dt = previous ? Math.max(1e-6, end - previous.end) : 0;
  const waves = fit.waves.map((wave, rank): Component => {
    const phaseAtEnd = wrap(wave.phase + TAU * wave.frequency * fit.seconds);
    let match: Component | undefined, cost = Infinity;
    for (const old of available) {
      const distance = Math.abs(wave.frequency - old.frequency);
      if (distance > 1.5 / fit.seconds) continue;
      const amplitudeCost = Math.abs(Math.log((wave.amplitude + 1e-9) / (old.amplitude + 1e-9)));
      if (amplitudeCost > Math.log(4)) continue;
      const phaseCost = Math.abs(Math.atan2(
        Math.sin(phaseAtEnd - old.phaseAtEnd - TAU * old.frequency * dt),
        Math.cos(phaseAtEnd - old.phaseAtEnd - TAU * old.frequency * dt)));
      const candidate = distance * fit.seconds + amplitudeCost * 0.25 + phaseCost * 0.1;
      if (candidate < cost) { cost = candidate; match = old; }
    }
    if (match) available.delete(match);
    return { ...wave, rank, id: match?.id ?? identity(), weight: total ? Math.max(0, wave.improvement) / total : 0,
      age: match ? match.age + dt : 0, phaseAtEnd, period: 1 / wave.frequency,
      slopeAmplitude: TAU * wave.frequency * wave.amplitude,
      amplitudeChange: match ? (wave.amplitude - match.amplitude) / dt : 0,
      frequencyChange: match ? (wave.frequency - match.frequency) / dt : 0 };
  });
  const rms = Math.sqrt(fit.observed.reduce((s, v) => s + v * v, 0) / fit.observed.length);
  const fittedRms = Math.sqrt(fit.fitted.reduce((s, v) => s + v * v, 0) / fit.fitted.length);
  const concentration = waves.reduce((s, w) => s + w.weight ** 2, 0);
  return { fit, start: end - fit.seconds, end, waves, rms, fittedRms,
    relativeRms: rms / Math.max(1e-9, fit.mean), residualRatio: rms > 1e-9 ? fit.rmse / rms : 0,
    centroid: waves.reduce((s, w) => s + w.weight * w.frequency, 0), concentration,
    effectiveWaves: concentration ? 1 / concentration : 0,
    meanChange: previous ? (fit.mean - previous.fit.mean) / dt : 0,
    persistence: waves.reduce((s, w) => s + w.weight * clamp(w.age / 8), 0) };
}

/** Evaluate inside observed history, explicitly compressed into a musical bar.
 * This weighted contour is a musical transform, not the unweighted fit. */
export function contour(window: WindowFeatures, fraction: number) {
  const time = clamp(fraction) * window.fit.seconds;
  let value = 0, slope = 0, amplitude = 0, slopeScale = 0;
  for (const w of window.waves) {
    const phase = TAU * w.frequency * time + w.phase;
    value += w.weight * w.amplitude * Math.sin(phase);
    slope += w.weight * w.slopeAmplitude * Math.cos(phase);
    amplitude += w.weight * w.amplitude;
    slopeScale += w.weight * w.slopeAmplitude;
  }
  return { value: amplitude > 0 ? value / amplitude : 0, slope: slopeScale > 0 ? slope / slopeScale : 0 };
}

export function nearestPitch(classes: readonly number[], target: number, low: number, high: number) {
  let best = low, distance = Infinity;
  for (let n = low; n <= high; n++) if (classes.includes(wrap(n, 12)) && Math.abs(n - target) < distance) {
    best = n; distance = Math.abs(n - target);
  }
  return best;
}

/** Authored reference: middle C / 0.5 cycles per reconstructed second. */
export const frequencyPitch = (frequency: number) => 60 + 12 * Math.log2(Math.max(1e-9, frequency) / 0.5);

/** Integrate each cell instead of point-sampling fast waves onto a slow rhythm
 * grid. All components contribute, but rapid oscillations cancel within a cell. */
export function contourCells(window: WindowFeatures, count = 16) {
  const width = window.fit.seconds / count;
  const scale = window.waves.reduce((s, w) => s + w.weight * w.amplitude, 0);
  const values = Array.from({ length: count }, (_, n) => window.waves.reduce((sum, w) => {
    const speed = TAU * w.frequency;
    return sum + w.weight * w.amplitude * (Math.cos(speed * n * width + w.phase) -
      Math.cos(speed * (n + 1) * width + w.phase)) / (speed * width);
  }, 0) / Math.max(1e-9, scale));
  return values.map((value, n) => ({ value, slope: n ? value - values[n - 1] : 0,
    turn: n > 0 && n < count - 1 && (value - values[n - 1]) * (values[n + 1] - value) < 0 }));
}
