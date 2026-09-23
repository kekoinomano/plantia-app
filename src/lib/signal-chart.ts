export const SIGNAL_WINDOW_MS = 8000;
export const SIGNAL_MAX_WINDOW_MS = 10000;
export const SIGNAL_DELAY_MS = 250;
export const SIGNAL_GAP_MS = 6000;
export type ChartPoint = {
  time: number; value: number; segment?: number;
  smooth?: number;
  // Keep raw observations for an exact sample mean at either window boundary.
  samples?: readonly { time: number; value: number }[];
};
export type SignalTiming = { packetMs: number; delayMs: number; gapMs: number; windowMs: number };
export const INITIAL_SIGNAL_TIMING: SignalTiming = { packetMs: 200, delayMs: 250, gapMs: 6000, windowMs: SIGNAL_WINDOW_MS };

/** Constant-memory ingestion. Every raw value contributes to a 50 ms mean,
 * but no raw sample objects or packet backlog are kept for the display.
 */
export class SignalTimeline {
  private ring = new Array<ChartPoint>(1024);
  private head = 0;
  private size = 0;
  private bin = -Infinity;
  private bucketSum = 0;
  private bucketCount = 0;
  private bucketTime = 0;
  private lastArrival: number | null = null;
  private lastSeq: number | null = null;
  private segment = 0;
  private mean = 200;
  private jitter = 0;
  private arrivals = new Array<number>(5);
  private arrivalIndex = 0;
  private arrivalCount = 0;
  private filtered = 0;
  private filteredTwice = 0;
  private filterAt: number | null = null;
  private timingDirty = false;
  private vertex(): ChartPoint | null {
    if (!this.bucketCount) return null;
    const value = this.bucketSum / this.bucketCount;
    const alpha = this.filterAt === null ? 1 : 1 - Math.exp(-(this.bucketTime - this.filterAt) / 90);
    const filtered = this.filtered + (value - this.filtered) * alpha;
    const smooth = this.filteredTwice + (filtered - this.filteredTwice) * alpha;
    return { time: this.bucketTime, value, smooth, segment: this.segment };
  }
  private flush() {
    const point = this.vertex();
    if (!point) return;
    const alpha = this.filterAt === null ? 1 : 1 - Math.exp(-(point.time - this.filterAt) / 90);
    this.filtered += (point.value - this.filtered) * alpha;
    this.filteredTwice = point.smooth!;
    this.filterAt = point.time;
    if (this.size === this.ring.length) { this.head = (this.head + 1) % this.ring.length; this.size--; }
    this.ring[(this.head + this.size) % this.ring.length] = point;
    this.size++;
    this.bucketSum = 0; this.bucketCount = 0;
  }
  push(values: readonly number[], arrival: number, seq: number) {
    if (!Number.isFinite(arrival) || !values.length) { this.lastSeq = null; return false; }
    let duration = 0;
    for (const value of values) {
      if (!Number.isSafeInteger(value) || value <= 0 || value > 5_000_000) { this.lastSeq = null; return false; }
      duration += value / 1000;
    }
    if (this.lastArrival !== null && arrival <= this.lastArrival) arrival = this.lastArrival + 0.001;
    const interval = this.lastArrival === null ? Math.max(50, duration) : arrival - this.lastArrival;
    const gap = this.lastArrival !== null && (this.lastSeq === null || seq !== this.lastSeq + 1);
    if (gap) {
      this.flush(); this.segment++; this.filterAt = null; this.arrivalCount = 0; this.arrivalIndex = 0;
    }
    if (this.lastArrival === null) this.mean = interval;
    else if (!gap) {
      this.arrivals[this.arrivalIndex] = interval;
      this.arrivalIndex = (this.arrivalIndex + 1) % 5;
      this.arrivalCount = Math.min(5, this.arrivalCount + 1);
      this.timingDirty = true;
    }
    const span = gap ? Math.min(interval, Math.max(50, Math.min(duration, this.mean))) : interval;
    const start = arrival - span;
    let elapsed = 0;
    for (const value of values) {
      elapsed += value / 1000;
      const time = Math.min(arrival, start + span * elapsed / duration);
      const bin = Math.floor(time / 50);
      if (bin !== this.bin) { this.flush(); this.bin = bin; }
      this.bucketSum += value; this.bucketCount++; this.bucketTime = time;
    }
    this.lastArrival = arrival; this.lastSeq = seq;
    return true;
  }
  get timing(): SignalTiming {
    // Reception statistics are calculated at publication rate, not per packet.
    if (this.timingDirty && this.arrivalCount) {
      const sorted = this.arrivals.slice(0, this.arrivalCount).sort((a, b) => a - b);
      this.mean = Math.max(1, sorted[Math.floor(sorted.length / 2)]);
      const deviations = sorted.map(v => Math.abs(v - this.mean)).sort((a, b) => a - b);
      this.jitter = deviations[Math.floor(deviations.length / 2)];
      this.timingDirty = false;
    }
    return { packetMs: this.mean, delayMs: this.mean + Math.max(180, this.mean * 0.1, Math.min(this.mean * 0.5, this.jitter * 2)),
      gapMs: Math.max(SIGNAL_GAP_MS, this.mean * 4), windowMs: SIGNAL_WINDOW_MS };
  }
  get snapshot() {
    const cutoff = (this.lastArrival ?? 0) - SIGNAL_MAX_WINDOW_MS - this.timing.delayMs - this.mean - 1000;
    while (this.size > 1 && this.ring[(this.head + 1) % this.ring.length].time < cutoff) {
      this.head = (this.head + 1) % this.ring.length; this.size--;
    }
    const result: ChartPoint[] = [];
    for (let i = 0; i < this.size; i++) result.push(this.ring[(this.head + i) % this.ring.length]);
    const pending = this.vertex();
    if (pending) result.push(pending);
    return result;
  }
}

export function signalPath(points: ChartPoint[], end: number, height: number, low: number, high: number, width = 320) {
  'worklet';
  const start = end - SIGNAL_WINDOW_MS;
  const y = (value: number) => height - 10 - (value - low) / Math.max(1, high - low) * (height - 20);
  let path = '';
  let drawing = false;
  for (let i = 0; i < points.length; i++) {
    const point = points[i], previous = points[i - 1];
    if (point.time < start) continue;
    const connected = previous && point.segment === previous.segment && point.time - previous.time <= SIGNAL_GAP_MS;
    if (point.time > end) {
      if (drawing && connected) path += `L${width},${y(previous.value + (point.value - previous.value) * (end - previous.time) / (point.time - previous.time)).toFixed(2)}`;
      break;
    }
    if (!drawing && connected && previous.time < start) {
      path += `M0,${y(previous.value + (point.value - previous.value) * (start - previous.time) / (point.time - previous.time)).toFixed(2)}`; drawing = true;
    }
    path += `${!drawing || !connected ? 'M' : 'L'}${((point.time - start) / SIGNAL_WINDOW_MS * width).toFixed(2)},${y(point.value).toFixed(2)}`;
    drawing = true;
  }
  return path;
}
export function signalBounds(points: ChartPoint[]) {
  let min = Infinity, max = -Infinity;
  for (const p of points) { min = Math.min(min, p.value); max = Math.max(max, p.value); }
  if (!points.length) return { low: 0, high: 1 };
  const padding = Math.max(1, (max - min) * 0.15);
  return { low: min - padding, high: max + padding };
}
export function signalCursor(points: ChartPoint[], end: number) {
  'worklet';
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    if (p.time > end) continue;
    const n = points[i + 1];
    if (n && n.segment === p.segment && n.time > p.time && n.time - p.time <= SIGNAL_GAP_MS)
      return { time: end, value: p.value + (n.value - p.value) * (end - p.time) / (n.time - p.time) };
    return end - p.time < 1 ? p : null;
  }
  return null;
}

/** All raw samples inside the displayed interval, not a mean of rendered extrema. */
export function signalMean(points: ChartPoint[], start: number, end: number) {
  let sum = 0, count = 0;
  for (const p of points) {
    const samples = p.samples;
    if (!samples?.length) {
      if (p.time >= start && p.time <= end) { sum += p.value; count++; }
    } else if (samples[0].time >= start && p.time <= end) {
      sum += p.value * samples.length; count += samples.length;
    } else if (p.time >= start && samples[0].time <= end) {
      for (const sample of samples) if (sample.time >= start && sample.time <= end) {
        sum += sample.value; count++;
      }
    }
  }
  return count ? sum / count : null;
}
