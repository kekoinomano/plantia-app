import type { RawPoint } from './raw-buffer';

export type Wave = { frequency: number; amplitude: number; phase: number; improvement: number; cumulative: number; values: number[] };
export type Fit = {
  seconds: number; originalSamples: number; times: number[]; mean: number; offset: number;
  observed: number[]; fitted: number[]; waves: Wave[];
  rmse: number; explained: number | null; computeMs: number; elapsedMs: number; maxSliceMs: number;
  target: number; reached: boolean; maxFrequency: number;
};
export const MAX_SAMPLES = 20000;
const FFT_SIZE = 2048;
const CANDIDATES = 32;
export type SignalPreview = { seconds: number; times: number[]; observed: number[]; available: number };

/** Input remains visible even while a fit is incomplete or unavailable. */
export function previewWindow(points: readonly RawPoint[], seconds: number): SignalPreview {
  const end = points.at(-1)?.time ?? 0, start = end - seconds;
  const window = points.filter(p => p.time >= start);
  const mean = window.reduce((sum, p) => sum + p.value / 1000, 0) / Math.max(1, window.length);
  return { seconds, times: window.map(p => p.time - start), observed: window.map(p => mean - p.value / 1000),
    available: points.length ? Math.min(seconds, end - points[0].time) : 0 };
}

/** FFT interpolation is ONLY for candidate discovery. Fits and error use all
 * original retained points at their actual (irregular) analysis timestamps.
 */
function shortlist(times: number[], values: number[], seconds: number, maxBin: number) {
  const real = new Float64Array(FFT_SIZE), imaginary = new Float64Array(FFT_SIZE);
  let cursor = 0;
  for (let i = 0; i < FFT_SIZE; i++) {
    const t = i * seconds / FFT_SIZE;
    while (cursor + 1 < times.length && times[cursor + 1] <= t) cursor++;
    const next = Math.min(times.length - 1, cursor + 1);
    const fraction = next === cursor ? 0 : Math.max(0, Math.min(1, (t - times[cursor]) / (times[next] - times[cursor])));
    real[i] = values[cursor] + fraction * (values[next] - values[cursor]);
  }
  for (let i = 1, j = 0; i < FFT_SIZE; i++) {
    let bit = FFT_SIZE >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const old = real[i]; real[i] = real[j]; real[j] = old; }
  }
  for (let length = 2; length <= FFT_SIZE; length *= 2) {
    const angle = -2 * Math.PI / length, cr = Math.cos(angle), ci = Math.sin(angle);
    for (let start = 0; start < FFT_SIZE; start += length) {
      let wr = 1, wi = 0;
      for (let j = 0; j < length / 2; j++) {
        const a = start + j, b = a + length / 2;
        const vr = real[b] * wr - imaginary[b] * wi, vi = real[b] * wi + imaginary[b] * wr;
        real[b] = real[a] - vr; imaginary[b] = imaginary[a] - vi;
        real[a] += vr; imaginary[a] += vi;
        const next = wr * cr - wi * ci; wi = wr * ci + wi * cr; wr = next;
      }
    }
  }
  return Array.from({ length: maxBin }, (_, i) => i + 1)
    .sort((a, b) => (real[b] ** 2 + imaginary[b] ** 2) - (real[a] ** 2 + imaginary[a] ** 2))
    .slice(0, CANDIDATES);
}

/** Freeze selected waves. At most 32 candidates and eight selections, even for
 * a target of 100%. No repeated full-spectrum scan for each residual.
 */
function* calculateWindow(points: readonly RawPoint[], seconds: number, target: number): Generator<void, Fit | null> {
  const last = points.at(-1);
  if (!last || points[0].time > last.time - seconds || seconds < 1 || seconds > 16) return null;
  const window = points.filter(p => p.time > last.time - seconds);
  const n = window.length;
  if (n < 20 || n > MAX_SAMPLES) return null;
  const times = window.map(p => p.time - (last.time - seconds));
  const mean = window.reduce((sum, p) => sum + p.value / 1000, 0) / n;
  const observed = window.map(p => mean - p.value / 1000);
  const energy = observed.reduce((sum, v) => sum + v * v, 0);
  const maxBin = Math.min(FFT_SIZE / 2 - 1, Math.floor(250 * seconds), Math.floor((n - 1) / 2));
  const bins = energy / n < 1e-12 ? [] : shortlist(times, observed, seconds, maxBin);
  yield;
  let sliceStart = performance.now();
  const candidates: { frequency: number; sin: Float64Array; cos: Float64Array; ss: number; cc: number; sc: number; used: boolean }[] = [];
  for (const bin of bins) {
    const sin = new Float64Array(n), cos = new Float64Array(n);
    let ss = 0, cc = 0, sc = 0;
    for (let i = 0; i < n; i++) {
      if (i % 256 === 0 && performance.now() - sliceStart >= 4) { yield; sliceStart = performance.now(); }
      const angle = 2 * Math.PI * bin * times[i] / seconds;
      const s = Math.sin(angle), c = Math.cos(angle);
      sin[i] = s; cos[i] = c; ss += s * s; cc += c * c; sc += s * c;
    }
    candidates.push({ frequency: bin / seconds, sin, cos, ss, cc, sc, used: false });
  }
  const residual = Float64Array.from(observed), fitted = new Array<number>(n).fill(0);
  const waves: Wave[] = [];
  let explained = energy / n < 1e-12 ? null : 0;
  for (let k = 0; k < 8 && explained !== null && explained + 1e-8 < target; k++) {
    let best: typeof candidates[number] | undefined, gain = 0, sine = 0, cosine = 0;
    for (const candidate of candidates) {
      if (candidate.used) continue;
      const { ss, cc, sc, sin, cos } = candidate;
      const determinant = ss * cc - sc * sc;
      if (determinant <= 1e-10 * n * n) continue;
      let sy = 0, cy = 0;
      for (let i = 0; i < n; i++) {
        if (i % 256 === 0 && performance.now() - sliceStart >= 4) { yield; sliceStart = performance.now(); }
        sy += sin[i] * residual[i]; cy += cos[i] * residual[i];
      }
      const a = (cc * sy - sc * cy) / determinant, b = (ss * cy - sc * sy) / determinant;
      const score = a * sy + b * cy;
      if (score > gain) { best = candidate; gain = score; sine = a; cosine = b; }
    }
    if (!best || gain < energy * 1e-12) break;
    best.used = true;
    const values = new Array<number>(n);
    let error = 0;
    for (let i = 0; i < n; i++) {
      if (i % 256 === 0 && performance.now() - sliceStart >= 4) { yield; sliceStart = performance.now(); }
      values[i] = sine * best.sin[i] + cosine * best.cos[i];
      residual[i] -= values[i]; fitted[i] += values[i]; error += residual[i] ** 2;
    }
    const previous = explained;
    explained = Math.max(0, Math.min(100, 100 * (1 - error / energy)));
    waves.push({ frequency: best.frequency, amplitude: Math.hypot(sine, cosine), phase: Math.atan2(cosine, sine),
      values, improvement: explained - previous, cumulative: explained });
  }
  const error = residual.reduce((sum, v) => sum + v * v, 0);
  return { seconds, originalSamples: window.reduce((sum, p) => sum + (p.count ?? 1), 0), times, mean,
    offset: 0, observed, fitted, waves, target, maxFrequency: maxBin / seconds,
    rmse: Math.sqrt(error / n), explained, reached: explained !== null && explained + 1e-8 >= target,
    computeMs: 0, elapsedMs: 0, maxSliceMs: 0 };
}

export async function analyzeWindow(points: readonly RawPoint[], seconds: number, target: number,
  cancelled: () => boolean = () => false): Promise<Fit | null> {
  const began = performance.now();
  const calculation = calculateWindow(points, seconds, target);
  let computeMs = 0, maxSliceMs = 0;
  while (!cancelled()) {
    const start = performance.now();
    const next = calculation.next();
    const duration = performance.now() - start;
    computeMs += duration; maxSliceMs = Math.max(maxSliceMs, duration);
    if (next.done) return next.value && { ...next.value, computeMs, maxSliceMs, elapsedMs: performance.now() - began };
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  calculation.return(null);
  return null;
}
