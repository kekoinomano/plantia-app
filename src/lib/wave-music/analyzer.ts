import type { PlantPacket } from '../plant-packet';
import { analyzeWindow } from './analysis';
import { RawBuffer } from './raw-buffer';
import { describe, type WaveFrame } from './features';

/** Packet-driven cadence, one job, shared snapshot/end for both fits. A busy
 * analysis never queues work; the next packet selects the latest history. */
export class WaveAnalyzer {
  private buffer = new RawBuffer();
  private generation = 0;
  private busy = false;
  private pending: Promise<void> = Promise.resolve();
  private due = -Infinity;
  private serial = 0;
  private identity = 0;
  private previous: WaveFrame | null = null;
  constructor(private publish: (frame: WaveFrame | null) => void,
    private fail: (error: unknown) => void) {}

  push(packet: PlantPacket, now: number) {
    const before = this.buffer.generation;
    this.buffer.push(packet, now * 1000);
    if (before !== this.buffer.generation) {
      this.generation++; this.previous = null; this.due = -Infinity; this.publish(null);
    }
    const history = this.buffer.points;
    const available = history.length ? history[history.length - 1].time - history[0].time : 0;
    // Start at the first complete short window, not the next two-second tick.
    // Promote to the full pair as soon as eight measured seconds are available.
    const promote = this.previous?.warmingUp && available >= 8;
    if (this.busy || available < 3 || (now < this.due && !promote)) return;
    this.due = now + 2;
    const points = history.slice(), end = points[points.length - 1].time;
    const generation = this.generation;
    const cancelled = () => generation !== this.generation;
    this.busy = true;
    this.pending = (async () => {
      try {
        const short = await analyzeWindow(points, 3, 95, cancelled);
        if (cancelled()) return;
        const long = available >= 8 ? await analyzeWindow(points, 8, 80, cancelled) : null;
        if (cancelled()) return;
        // An intro uses only the real 3 s fit. No zero filling or invented long fit.
        if (!short || available >= 8 && !long) { this.previous = null; this.publish(null); return; }
        const nextId = () => ++this.identity;
        const shortFeatures = describe(short, end, this.previous?.short ?? null, nextId);
        this.previous = { id: ++this.serial, sequence: packet.seq, arrival: now,
          short: shortFeatures, warmingUp: !long,
          long: long ? describe(long, end, this.previous?.warmingUp ? null : this.previous?.long ?? null, nextId)
            : shortFeatures };
        this.publish(this.previous);
      } catch (error) {
        if (!cancelled()) { this.previous = null; this.publish(null); this.fail(error); }
      } finally { this.busy = false; }
    })();
  }

  /** Deterministic replay may await the current job; live scheduling never waits. */
  whenIdle() { return this.pending; }

  get collectedSeconds() {
    const points = this.buffer.points;
    return points.length ? Math.max(0, points[points.length - 1].time - points[0].time) : 0;
  }

  reset() {
    this.generation++; this.buffer.reset(); this.previous = null; this.due = -Infinity;
    // A cancelled worker retains the busy flag until its next yield.
  }
}
