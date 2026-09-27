import type { PlantPacket } from '../plant-packet';

export type RawGreeting = { time: number; sequence: number; direction: -1 | 1;
  strength: number; peakMs: number; baselineMs: number; thresholdRatio: number };
const median = (values: number[]) => {
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : values.length ? (values[middle - 1] + values[middle]) / 2 : 0;
};
/** Raw, reception-clock detector. This runs BEFORE FFT/reduction. A transient is
 * unusual relative to the raw distribution, not merely large in absolute units.
 * Thresholds are musical event heuristics, not biological classifications. */
export class GreetingDetector {
  private history: { time: number; values: number[] }[] = [];
  private started = -Infinity;
  private previousTime = -Infinity;
  private previousSeq: number | null = null;
  private lastGreeting = -Infinity;
  private statsAt = -Infinity;
  private center = 0;
  private threshold = Infinity;
  reset() {
    this.history = []; this.started = this.previousTime = this.lastGreeting = this.statsAt = -Infinity;
    this.previousSeq = null; this.center = 0; this.threshold = Infinity;
  }
  push(packet: PlantPacket, now: number): RawGreeting | null {
    const valid = !packet.error && Number.isFinite(now) && Number.isSafeInteger(packet.seq) &&
      packet.values?.length === 10 && packet.values.every(v => Number.isSafeInteger(v) && v > 0 && v <= 5_000_000);
    if (!valid) { this.reset(); return null; }
    if (this.previousSeq !== null && (packet.seq !== this.previousSeq + 1 || now < this.previousTime || now - this.previousTime > 6)) this.reset();
    if (!Number.isFinite(this.started)) this.started = now;
    this.previousSeq = packet.seq; this.previousTime = now;
    this.history = this.history.filter(entry => now - entry.time <= 4).slice(-200);
    if (now - this.statsAt >= 0.1) {
      const old = this.history.flatMap(entry => entry.values).sort((a, b) => a - b);
      if (old.length >= 40) {
        this.center = median(old);
        const deviations = old.map(v => Math.abs(v - this.center)).sort((a, b) => a - b);
        const mad = median(deviations);
        const extreme = deviations[Math.floor((deviations.length - 1) * .99)];
        // Compare with the signal's usual excursions. The graph also centers
        // these small variations, so a visible spike need not change the raw
        // period by anything close to 70%.
        this.threshold = Math.max(Math.log(1.005), 2 * mad, 1.6 * extreme);
      }
      this.statsAt = now;
    }
    const values = packet.values!.map(v => Math.log(v / 1000));
    const deltas = values.map(v => v - this.center);
    const extremeIndex = deltas.reduce((best, value, i) => Math.abs(value) > Math.abs(deltas[best]) ? i : best, 0);
    const delta = deltas[extremeIndex];
    const confirmed = deltas.filter(v => Math.sign(v) === Math.sign(delta) && Math.abs(v) > this.threshold).length >= 2 || Math.abs(delta) > this.threshold * 1.1;
    const fire = now - this.started >= 2 && now - this.lastGreeting >= 8 && confirmed && Math.abs(delta) > this.threshold;
    this.history.push({ time: now, values });
    if (!fire) return null;
    this.lastGreeting = now;
    return { time: now, sequence: packet.seq, direction: delta > 0 ? 1 : -1,
      strength: Math.min(1, Math.abs(delta) / this.threshold - 1), peakMs: Math.exp(values[extremeIndex]),
      baselineMs: Math.exp(this.center), thresholdRatio: Math.exp(this.threshold) };
  }
}
