import { clamp, TAU, type WindowFeatures } from './features';

/** Musical coordinates, not physical frequencies. Compress ratios into 0.5–4
 * cycles per motif BEFORE sampling; never average away the measured carrier. */
export function musicalField(window: WindowFeatures, count = 16) {
  const reference = Math.exp(window.waves.reduce((s, w) => s + w.weight * Math.log(w.frequency), 0));
  const components = window.waves.map(w => ({ id: w.id, weight: w.weight,
    cycles: 0.5 + 3.5 * w.frequency / (w.frequency + reference), phase: w.phaseAtEnd }));
  const cells = Array.from({ length: count }, (_, i) => {
    const position = i / count;
    const value = components.reduce((s, w) => s + w.weight * Math.sin(TAU * w.cycles * position + w.phase), 0);
    const motion = components.reduce((s, w) => s + w.weight * Math.cos(TAU * w.cycles * position + w.phase), 0);
    return { value, motion, accent: clamp(0.5 + value * 0.32 + Math.abs(motion) * 0.18) };
  });
  return { reference, components, cells };
}

export function musicalFeatures(short: WindowFeatures, long: WindowFeatures) {
  const relative = short.fittedRms / Math.max(1e-9, short.fit.mean);
  // Fixed musical sensitivity: half range at 0.3% relative RMS. Not a noise calibration.
  // No per-window normalization that would turn a flat signal into a loud one.
  const energy = relative / (relative + 0.003);
  const speed = Math.log1p(long.centroid) / Math.log(251);
  const spread = 1 - short.concentration;
  const contrast = Math.tanh(Math.log((short.fittedRms + 1e-6) / (long.fittedRms + 1e-6)));
  const evolution = short.waves.reduce((s, w) => s + w.weight *
    (Math.abs(w.amplitudeChange) / (w.amplitude + 0.001) +
      Math.abs(w.frequencyChange) / Math.max(w.frequency, 1 / short.fit.seconds)), 0);
  return { relative, energy, speed: clamp(speed), spread, contrast,
    evolution: evolution / (evolution + 0.18), persistence: long.persistence };
}

/** Exhaustive small voicing palette; keep ordered voices and leave room for bass. */
export function voiceLead(classes: readonly number[], previous: readonly number[], low = 53, high = 76) {
  let best: number[] = [], bestCost = Infinity;
  for (let rotation = 0; rotation < classes.length; rotation++) for (const octave of [36, 48, 60]) {
    const pitches: number[] = [];
    for (let i = 0; i < classes.length; i++) {
      let pitch = octave + classes[(rotation + i) % classes.length];
      while (pitch < low || i > 0 && pitch < pitches[i - 1] + 1) pitch += 12;
      pitches.push(pitch);
    }
    if (pitches.at(-1)! > high) continue;
    // A diatonic semitone in an upper voicing is preferable to forcing a
    // 13-semitone hole (e.g. D–Eb). Penalize wide gaps and low-register clusters.
    const cost = pitches.reduce((sum, n, i) => sum + Math.abs(n - (previous[i] ?? 55 + i * 4)) +
      (i ? Math.max(0, n - pitches[i - 1] - 7) * 2 +
        (n < 60 && n - pitches[i - 1] < 3 ? 4 : 0) : 0), 0);
    if (cost < bestCost) { best = pitches; bestCost = cost; }
  }
  return best.length ? best : classes.map(n => 60 + n).sort((a, b) => a - b);
}

/** Shape descriptors retain frequency distribution, which a centroid loses.
 * Fixed log-frequency bands and log-mean are aesthetic coordinates, not diagnoses. */
export function signalIdentity(window: WindowFeatures) {
  const bands = Array.from({ length: 6 }, () => 0);
  for (const wave of window.waves) {
    const position = clamp(Math.log2(1 + wave.frequency) - 1, 0, 5);
    const low = Math.floor(position), high = Math.min(5, low + 1);
    bands[low] += wave.weight * (1 - (position - low));
    bands[high] += wave.weight * (position - low);
  }
  const reference = Math.exp(window.waves.reduce((s, w) => s + w.weight * Math.log(Math.max(w.frequency, 1e-9)), 0));
  const width = clamp(Math.sqrt(window.waves.reduce((s, w) =>
    s + w.weight * Math.log2(Math.max(w.frequency, 1e-9) / reference) ** 2, 0)) / 2);
  const mean = clamp(Math.log2(1 + window.fit.mean) / 10);
  return { bands, width, mean, reference };
}

export function signalDistance(a: WindowFeatures, b: WindowFeatures) {
  const left = signalIdentity(a), right = signalIdentity(b);
  return left.bands.reduce((sum, value, i) => sum + Math.abs(value - right.bands[i]), 0) / 2 +
    Math.abs(Math.log2((a.fittedRms + 1e-6) / (b.fittedRms + 1e-6))) * 0.15 +
    Math.abs(left.mean - right.mean) * 2;
}
