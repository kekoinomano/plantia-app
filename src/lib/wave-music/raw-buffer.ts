import type { PlantPacket } from '../plant-packet';

export type RawPoint = { time: number; value: number; count?: number };
const MAX_ARRAYS_PER_SECOND = 50;
export type RateStats = { receivedArrays: number; receivedValues: number; keptArrays: number; keptValues: number; invalidArrays: number };
const emptyRate = (): RateStats => ({ receivedArrays: 0, receivedValues: 0, keptArrays: 0, keptValues: 0, invalidArrays: 0 });

/** Shared acquisition reduction: at most 50 ten-position arrays per reception second.
 * Ten consecutive arrays become one: each output position is the mean of one
 * input array. Counts preserve correct means if a group is reduced again.
 * The sensor clock always advances by ORIGINAL periods, never by their means.
 */
export class RawBuffer {
  arrival = -Infinity;
  revision = 0;
  generation = 0;
  rejected = 0;
  private rates = new Map<number, RateStats>();
  /** Last CLOSED reception second, including zero when input stops. */
  getRate(now: number): RateStats {
    const second = Math.floor(now / 1000) - 1;
    return { ...(this.rates.get(second) ?? emptyRate()) };
  }
  private sequence: number | null = null;
  private time = 0;
  private second = -Infinity;
  private arrays: RawPoint[][] = [];
  private history: RawPoint[] = [];
  private cached: RawPoint[] = [];
  private cachedRevision = -1;

  get points(): RawPoint[] {
    if (this.cachedRevision !== this.revision) {
      this.cached = [...this.history, ...this.arrays.flat()];
      this.cachedRevision = this.revision;
    }
    return this.cached;
  }
  reset(clearRates = true) {
    if (clearRates) this.rates.clear();
    this.generation++;
    this.history = []; this.arrays = []; this.cached = [];
    this.second = -Infinity; this.sequence = null; this.time = 0;
    this.arrival = -Infinity; this.revision++;
  }
  private reduce() {
    while (this.arrays.length > MAX_ARRAYS_PER_SECOND) {
      // Prefer the least-reduced consecutive group, so we do not repeatedly
      // erase detail at the beginning of a busy second. Never mix chronology.
      const weights = this.arrays.map(a => a.reduce((sum, p) => sum + (p.count ?? 1), 0));
      let first = 0, best = Infinity;
      for (let i = 0; i <= weights.length - 10; i++) {
        let cost = 0;
        for (let j = i; j < i + 10; j++) cost += weights[j];
        if (cost < best) { best = cost; first = i; }
      }
      const merged = this.arrays.slice(first, first + 10).map(array => {
        let sum = 0, count = 0;
        for (const p of array) { sum += p.value * (p.count ?? 1); count += p.count ?? 1; }
        return { time: array[array.length - 1].time, value: sum / count, count };
      });
      this.arrays.splice(first, 10, merged);
    }
  }
  push(packet: PlantPacket | null, arrival: number) {
    if (!packet) { this.reset(); return; }
    if (!Number.isFinite(arrival)) { this.rejected++; this.reset(false); return; }
    const receptionSecond = Math.floor(arrival / 1000);
    const rate = this.rates.get(receptionSecond) ?? emptyRate();
    this.rates.set(receptionSecond, rate);
    rate.receivedArrays++; rate.receivedValues += packet.values?.length ?? 0;
    for (const key of this.rates.keys()) if (key < receptionSecond - 2) this.rates.delete(key);
    if (this.sequence !== null && (packet.seq !== this.sequence + 1 || arrival < this.arrival || arrival - this.arrival > 6000)) this.reset(false);
    if (packet.error || packet.values?.length !== 10 || packet.values.some(value =>
      !Number.isSafeInteger(value) || value <= 0 || value > 5_000_000)) {
      rate.invalidArrays++; rate.keptArrays = rate.keptValues = 0;
      this.rejected++; this.reset(false); return;
    }
    this.sequence = packet.seq; this.arrival = arrival;
    const second = Math.floor(arrival / 1000);
    if (second !== this.second) {
      this.history.push(...this.arrays.flat()); this.arrays = []; this.second = second;
    }
    this.arrays.push(packet.values.map(value => {
      this.time += value / 1e6;
      return { time: this.time, value, count: 1 };
    }));
    this.reduce();
    rate.keptArrays = this.arrays.length;
    rate.keptValues = this.arrays.reduce((sum, array) => sum + array.length, 0);
    const cutoff = this.time - 17;
    let low = 0, high = this.history.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.history[middle].time < cutoff) low = middle + 1; else high = middle;
    }
    if (low > 1) this.history.splice(0, low - 1);
    // Defensive cap for inconsistent reception/acquisition clocks.
    if (this.history.length > 32000) this.history.splice(0, this.history.length - 32000);
    this.revision++;
  }
}
