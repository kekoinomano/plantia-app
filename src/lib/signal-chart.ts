export const SIGNAL_WINDOW_MS = 12_000;
export const SIGNAL_SAMPLE_COUNT = 120;

type ChartPoint = { time: number; value: number };

export type SignalChartFrame = {
  historyMs: number;
  values: number[];
};

/**
 * Resample the real amount of history we have across the whole chart. Once the
 * session reaches SIGNAL_WINDOW_MS this naturally becomes a moving window.
 */
export function createSignalChartFrame(
  points: ChartPoint[],
  height: number,
  count = SIGNAL_SAMPLE_COUNT,
): SignalChartFrame {
  if (!points.length || count <= 0) return { historyMs: 0, values: [] };

  const end = points[points.length - 1].time;
  const start = Math.max(points[0].time, end - SIGNAL_WINDOW_MS);
  const historyMs = Math.max(0, end - start);
  const raw = Array<number>(count);
  let cursor = 0;

  for (let i = 0; i < count; i++) {
    const time = historyMs === 0 ? end : start + (i / Math.max(1, count - 1)) * historyMs;
    while (cursor < points.length - 2 && points[cursor + 1].time < time) cursor++;

    const left = points[cursor];
    const right = points[Math.min(cursor + 1, points.length - 1)];
    const span = right.time - left.time;
    const progress = span > 0 ? Math.max(0, Math.min(1, (time - left.time) / span)) : 0;
    raw[i] = left.value + (right.value - left.value) * progress;
  }

  const min = Math.min(...raw);
  const max = Math.max(...raw);
  const spread = max - min;
  if (spread < Number.EPSILON) {
    return { historyMs, values: raw.map(() => height / 2) };
  }

  const padding = Math.max(2, spread * 0.18);
  const low = min - padding;
  const range = spread + padding * 2;
  return {
    historyMs,
    values: raw.map((value) => height - ((value - low) / range) * height),
  };
}

export function formatSignalHistory(historyMs: number) {
  if (historyMs >= SIGNAL_WINDOW_MS - 50) return "−12 s";
  const seconds = Math.max(0.1, historyMs / 1000);
  return `−${seconds < 1 ? seconds.toFixed(1) : Math.round(seconds)} s`.replace(".", ",");
}
