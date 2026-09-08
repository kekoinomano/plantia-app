export const SIGNAL_WINDOW_MS = 12_000;
export const SIGNAL_DELAY_MS = 400;
export const SIGNAL_GAP_MS = 600;
export type ChartPoint = { time: number; value: number };

/** A sample keeps its time and amplitude; only the viewport moves. */
export function signalPath(
  points: ChartPoint[], end: number, height: number, low: number, high: number, width = 320,
) {
  "worklet";
  const start = end - SIGNAL_WINDOW_MS;
  const x = (time: number) => ((time - start) / SIGNAL_WINDOW_MS) * width;
  const y = (value: number) => height - 10 - ((value - low) / Math.max(1, high - low)) * (height - 20);
  let path = "";
  let drawing = false;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const previous = points[i - 1];
    if (point.time < start) continue;
    if (point.time > end) {
      if (drawing && previous && point.time - previous.time <= SIGNAL_GAP_MS) {
        const value = previous.value + (point.value - previous.value) * (end - previous.time) / (point.time - previous.time);
        path += `L${width},${y(value).toFixed(2)}`;
      }
      break;
    }
    if (!drawing && previous && previous.time < start && point.time - previous.time <= SIGNAL_GAP_MS) {
      const value = previous.value + (point.value - previous.value) * (start - previous.time) / (point.time - previous.time);
      path += `M0,${y(value).toFixed(2)}`;
      drawing = true;
    }
    const move = !drawing || (previous && point.time - previous.time > SIGNAL_GAP_MS);
    path += `${move ? "M" : "L"}${x(point.time).toFixed(2)},${y(point.value).toFixed(2)}`;
    drawing = true;
  }
  return path;
}

export function signalBounds(points: ChartPoint[]) {
  const values = points.map((point) => point.value);
  const min = Math.min(...values), max = Math.max(...values);
  const padding = Math.max(10, (max - min) * 0.25);
  return { low: min - padding, high: max + padding };
}


export function signalCursor(points: ChartPoint[], end: number) {
  "worklet";
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i];
    if (point.time > end) continue;
    const next = points[i + 1];
    if (next && next.time - point.time <= SIGNAL_GAP_MS) {
      return { time: end, value: point.value + (next.value - point.value) * (end - point.time) / (next.time - point.time) };
    }
    return end - point.time <= SIGNAL_GAP_MS ? point : null;
  }
  return null;
}
