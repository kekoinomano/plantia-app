import { median, type Frame } from './signal.ts';
// Touch confirmation must stay brief even when sparse telemetry is still live.
const GAP_SECONDS = 1.5;
/** Detects coherent brief excursions, not their biological cause. Two frames reject isolated packet glitches. */
export function createGestureDetector() {
  let previous: Frame | null = null,
    began = 0,
    lastGreeting = -Infinity;
  let history: { time: number; center: number; step: number }[] = [];
  let candidate: { baseline: number; center: number; time: number } | null =
    null;
  let active: {
    baseline: number;
    contrast: number;
    time: number;
    settled: number;
  } | null = null;
  return {
    get engaged() {
      return candidate !== null || active !== null;
    },
    push(frame: Frame) {
      const gap = previous !== null && frame.time - previous.time > GAP_SECONDS;
      if (!previous || gap) {
        previous = frame;
        began = frame.time;
        history = [];
        candidate = null;
        active = null;
      }
      const step = Math.abs(frame.center - previous.center);
      previous = frame;
      history = history.filter((p) => frame.time - p.time <= 6);
      if (active) {
        const returned =
          Math.abs(frame.center - active.baseline) <
          Math.max(0.06, active.contrast * 0.18);
        active.settled = returned ? active.settled + 1 : 0;
        if (active.settled >= 2 || frame.time - active.time > 8) {
          active = null;
          candidate = null;
          history = [];
        }
        return null;
      }
      const baseline = history.length
        ? median(history.map((p) => p.center))
        : frame.center;
      const noise = median(history.map((p) => p.step));
      const threshold = Math.max(0.13, noise * 9);
      const deviation = Math.abs(frame.center - baseline);
      if (candidate) {
        const contrast = Math.abs(candidate.center - candidate.baseline);
        const sameDirection =
          Math.sign(frame.center - candidate.baseline) ===
          Math.sign(candidate.center - candidate.baseline);
        if (
          frame.time - candidate.time <= GAP_SECONDS &&
          sameDirection &&
          Math.abs(frame.center - candidate.baseline) > contrast * 0.3
        ) {
          active = {
            baseline: candidate.baseline,
            contrast,
            time: frame.time,
            settled: 0,
          };
          candidate = null;
          lastGreeting = frame.time;
          return { contrast, source: frame.seq, time: frame.time };
        }
        candidate = null;
      }
      if (
        frame.time - began >= 0.75 &&
        frame.time - lastGreeting >= 3 &&
        step > threshold &&
        deviation > threshold
      ) {
        candidate = { baseline, center: frame.center, time: frame.time };
        return null;
      }
      history.push({ time: frame.time, center: frame.center, step });
      return null;
    },
  };
}
