import { clamp, type Frame } from './signal.ts';
import { createGestureDetector } from './gesture.ts';

export type PlantCharacter = { level: number; pace: number; variation: number; texture: number };
export type MusicalIntent = {
  frame: Frame;
  character: PlantCharacter;
  motion: number;
  detail: number;
  profileScale: number;
  bands: number[];
  shape: number;
  contour: number;
  position: number;
  greeting: boolean;
  packet: {
    cadence: number;
    pace: number;
    change: number;
    regime: number;
    confidence: number;
  };
  fingerprint: { cadence: number; irregularity: number; entropy: number; asymmetry: number; novelty: number };
  history: {
    trend: number; volatility: number; recurrence: number; burst: number; range: number;
    deviation: number; microChange: number; turn: number;
  };
};

type HistoryPoint = {
  time: number; center: number; profile: number[];
  change: number; signedChange: number; profileChange: number;
};
const quantile = (values: number[], position: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.round((sorted.length - 1) * position)];
};

/** Updated ONLY by real readings. Musical clock ticks must never reanalyse a packet. */
export class PlantInterpreter {
  private previous: Frame | null = null;
  private baseline = 0;
  private cadence = 0.5;
  private irregularity = 0;
  private character: PlantCharacter = { level: 0.5, pace: 0.5, variation: 0, texture: 0 };
  private gesture = createGestureDetector();
  // About 24 seconds at the accumulator's maximum four frames per second.
  private history: HistoryPoint[] = [];

  push(f: Frame): MusicalIntent {
    const first = !this.previous;
    const delta = first ? 0 : f.center - this.previous!.center;
    const dt = first ? 0.25 : Math.max(0.001, f.time - this.previous!.time);
    const packetCadence = f.packetCadence ?? f.cadence;
    const packetPace = 1 / (1 + Math.max(0.001, packetCadence) / 0.12);
    const measured = {
      level: clamp((f.center + 2) / 24),
      pace: packetPace,
      variation: Math.abs(delta) / (Math.abs(delta) + dt * 0.12),
      texture: f.spread / (f.spread + 0.08),
    };
    const follow = first ? 1 : 1 - Math.exp(-dt / 4);
    // Logarithmic range keeps 0.1 s, 1 s and 5 s plants distinguishable.
    const cadence = clamp(Math.log1p(Math.max(0, packetCadence) * 20) / Math.log(121));
    const jitter = first ? 0 : Math.abs(f.cadence - this.previous!.cadence) /
      Math.max(0.05, f.cadence + this.previous!.cadence);
    this.cadence += (cadence - this.cadence) * (first ? 1 : follow);
    this.irregularity += (jitter - this.irregularity) * follow;
    for (const key of ['level', 'pace', 'variation', 'texture'] as const)
      this.character[key] += (measured[key] - this.character[key]) * follow;
    this.baseline = first ? f.center : this.baseline + (f.center - this.baseline) * (1 - Math.exp(-dt / 3));
    const profileScale = Math.max(0.004, f.spread);
    const bandSum = Math.max(0.0001, f.spectrum.reduce((sum, x) => sum + x, 0));
    const shape = f.spectrum.reduce((sum, x, i) => sum + x * (i + 1), 0) /
      Math.max(1e-8, f.spectrum.reduce((sum, x) => sum + x, 0)) / 9;
    const entropy = -f.spectrum.reduce((sum, x) => {
      const p = x / bandSum;
      return sum + (p > 0 ? p * Math.log(p) : 0);
    }, 0) / Math.log(9);
    const profileEnergy = f.profile.reduce((sum, x) => sum + Math.abs(x), 0);
    const asymmetry = profileEnergy > 1e-8
      ? f.profile.reduce((sum, x, i) => sum + Math.abs(x) * (i / Math.max(1, f.profile.length - 1) * 2 - 1), 0) / profileEnergy : 0;
    const previousBandSum = Math.max(0.0001, this.previous?.spectrum.reduce((a, b) => a + b, 0) ?? 0);
    const novelty = first ? 0 : clamp(Math.abs(delta) / (profileScale + Math.abs(delta)) * 0.55 +
      f.spectrum.reduce((sum, x, i) => sum + Math.abs(x / bandSum -
        this.previous!.spectrum[i] / previousBandSum), 0) * 0.225);
    const profileChange = first ? 0 : meanDistance(f.profile, this.previous!.profile);
    const previousDirection = this.history.at(-1)?.signedChange ?? 0;
    this.history.push({ time: f.time, center: f.center, profile: [...f.profile],
      change: Math.abs(delta) / dt, signedChange: delta / dt, profileChange });
    this.history = this.history.filter((point) => f.time - point.time <= 24).slice(-96);
    const centers = this.history.map((point) => point.center);
    const middle = quantile(centers, 0.5);
    const scale = Math.max(0.02, quantile(centers.map((x) => Math.abs(x - middle)), 0.5) * 1.4826);
    const half = Math.max(1, Math.floor(centers.length / 2));
    const older = quantile(centers.slice(0, half), 0.5);
    const newer = quantile(centers.slice(-half), 0.5);
    const changes = this.history.slice(1).map((point) => point.change);
    const recentChanges = this.history.filter((point) => f.time - point.time <= 3).map((point) => point.change);
    const longChange = quantile(changes, 0.5);
    const shortChange = quantile(recentChanges, 0.5);
    const candidates = this.history.filter((point) => f.time - point.time >= 2);
    const recurrence = candidates.length ? Math.max(...candidates.map((point) =>
      1 - meanDistance(f.profile, point.profile))) : 0;
    const robustRange = quantile(centers, 0.9) - quantile(centers, 0.1);
    const typicalProfileChange = quantile(this.history.slice(1).map((point) => point.profileChange), 0.5);
    const microChange = first ? 0 : 1 - Math.exp(-Math.abs(delta) / (scale * 0.45) -
      profileChange / Math.max(0.003, typicalProfileChange * 1.5));
    const turn = first || !previousDirection || !delta || Math.sign(previousDirection) === Math.sign(delta)
      ? 0 : clamp(Math.abs(delta) / (scale + Math.abs(delta)));
    this.previous = f;
    return {
      frame: f, character: { ...this.character }, profileScale, shape,
      motion: 1 - Math.exp(-Math.abs(delta) * 24 - f.roughness * 8),
      detail: 1 - Math.exp(-f.spread * 18),
      bands: f.spectrum.map((x) => Math.sqrt(x / bandSum)),
      contour: Math.tanh((f.center - this.baseline) * 60 + f.slope * 35),
      position: clamp(0.1 + this.character.level * 0.65 +
        (this.character.pace - 0.5) * 0.24 + (shape - 0.5) * 0.22, 0.12, 0.88),
      greeting: Boolean(this.gesture.push(f)),
      packet: {
        cadence: packetCadence,
        pace: packetPace,
        change: f.packetTempoChange ?? 0,
        regime: f.packetRegime ?? 0,
        confidence: f.packetConfidence ?? 0,
      },
      fingerprint: { cadence: this.cadence, irregularity: this.irregularity,
        entropy: clamp(entropy), asymmetry, novelty },
      history: {
        trend: Math.tanh((newer - older) / (scale * 2.5)),
        volatility: clamp(longChange / (longChange + 0.18)),
        recurrence: clamp(recurrence),
        burst: clamp((shortChange / Math.max(0.001, longChange) - 0.8) / 2.2),
        range: clamp(robustRange / (robustRange + 0.18)),
        deviation: Math.tanh((f.center - middle) / (scale * 1.8)),
        microChange: clamp(microChange),
        turn,
      },
    };
  }
}

function meanDistance(a: number[], b: number[]) {
  return a.reduce((sum, value, i) => sum + Math.abs(value - (b[i] ?? 0)) / Math.max(1, a.length), 0);
}
