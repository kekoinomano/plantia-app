import type { ChartPoint } from './signal-chart';

export type CurveVertex = {
  time: number; value: number; segment?: number;
  a: number; b: number; c: number; area: number; duration: number;
};
export type SignalCurve = {
  reference: number; vertices: CurveVertex[];
  treeSize: number; minima: number[]; maxima: number[];
};

/** Prepare compact interpolation coefficients and statistics at the capped
 * publication rate. No SVG strings or raw observations cross to the UI thread.
 */
export function prepareSignalCurve(points: ChartPoint[]): SignalCurve {
  const reference = points[0]?.smooth ?? points[0]?.value ?? 0;
  const vertices: CurveVertex[] = points.map(p => ({ time: p.time,
    value: (p.smooth ?? p.value) - reference, segment: p.segment,
    a: 0, b: 0, c: 0, area: 0, duration: 0 }));
  const slopes = vertices.map((p, i) => {
    const before = vertices[i - 1], after = vertices[i + 1];
    const left = before && before.segment === p.segment && p.time > before.time
      ? (p.value - before.value) / (p.time - before.time) : null;
    const right = after && after.segment === p.segment && after.time > p.time
      ? (after.value - p.value) / (after.time - p.time) : null;
    if (left === null) return right ?? 0;
    if (right === null) return left;
    // Monotone tangents preserve peaks without stopping at every sample.
    if (left * right <= 0) return 0;
    return Math.sign(left) * Math.min(Math.abs(left), Math.abs(right));
  });
  for (let i = 0; i < vertices.length; i++) {
    const p = vertices[i], next = vertices[i + 1];
    if (!next) break;
    next.area = p.area; next.duration = p.duration;
    const dt = next.time - p.time;
    if (next.segment !== p.segment || dt <= 0) continue;
    const change = next.value - p.value;
    p.c = dt * slopes[i];
    p.b = 3 * change - 2 * p.c - dt * slopes[i + 1];
    p.a = p.c + dt * slopes[i + 1] - 2 * change;
    next.area += dt * (p.value + p.c / 2 + p.b / 3 + p.a / 4);
    next.duration += dt;

  }
  // Range extrema are prepared on JS once, rather than scanning the entire
  // visible trace on the UI thread at every refresh.
  let treeSize = 1;
  while (treeSize < vertices.length) treeSize *= 2;
  const minima = new Array<number>(treeSize * 2).fill(Infinity);
  const maxima = new Array<number>(treeSize * 2).fill(-Infinity);
  for (let i = 0; i < vertices.length; i++) minima[treeSize + i] = maxima[treeSize + i] = vertices[i].value;
  for (let i = treeSize - 1; i > 0; i--) {
    minima[i] = Math.min(minima[i * 2], minima[i * 2 + 1]);
    maxima[i] = Math.max(maxima[i * 2], maxima[i * 2 + 1]);
  }
  return { reference, vertices, treeSize, minima, maxima };
}

/** Prefix integrals give the exact mean of the visible cubic trace, including
 * partially visible edge segments, with two binary searches per frame.
 */
export function curveAt(vertices: CurveVertex[], time: number) {
  'worklet';
  if (!vertices.length) return { value: 0, area: 0, duration: 0, index: 0, visible: false };
  let low = 0, high = vertices.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (vertices[middle].time <= time) low = middle;
    else high = middle - 1;
  }
  const p = vertices[low], next = vertices[low + 1];
  if (time < p.time || !next || next.segment !== p.segment || next.time <= p.time)
    return { value: p.value, area: p.area, duration: p.duration, index: low, visible: Math.abs(time - p.time) < 1 };
  const dt = next.time - p.time;
  const u = Math.max(0, Math.min(1, (time - p.time) / dt));
  return { value: p.value + u * (p.c + u * (p.b + u * p.a)),
    area: p.area + dt * u * (p.value + u * (p.c / 2 + u * (p.b / 3 + u * p.a / 4))),
    duration: p.duration + dt * u, index: low, visible: true };
}

export function curveExtrema(curve: SignalCurve, first: number, last: number) {
  'worklet';
  let low = Infinity, high = -Infinity;
  let left = first + curve.treeSize, right = last + curve.treeSize;
  while (left <= right) {
    if (left % 2 === 1) {
      low = Math.min(low, curve.minima[left]); high = Math.max(high, curve.maxima[left]); left++;
    }
    if (right % 2 === 0) {
      low = Math.min(low, curve.minima[right]); high = Math.max(high, curve.maxima[right]); right--;
    }
    left = Math.floor(left / 2); right = Math.floor(right / 2);
  }
  return { low, high };
}

/** The grid belongs to signal time, not the moving screen. Rebuilding a tile
 * therefore never changes the samples of the already visible curve. */
export function rasterSignalPath(curve: SignalCurve, end: number, windowMs: number,
  mean: number, amplitude: number) {
  'worklet';
  if (!curve.vertices.length) return '';
  const step = windowMs / 160;
  const firstTime = curve.vertices[0].time, lastTime = curve.vertices[curve.vertices.length - 1].time;
  const start = end - windowMs;
  const first = Math.max(firstTime, Math.floor(start / step) * step);
  const last = Math.min(lastTime, end + windowMs);
  const scale = 71 / Math.max(0.01, amplitude);
  let path = '', drawing = false;
  let previousX = 0, previousY = 0, previousSegment: number | undefined;
  let previousVisible = false;
  let time = first;
  // At most 323 vertices for a tile twice as wide as the visible window.
  for (let i = 0; i < 324 && time <= last; i++) {
    const point = curveAt(curve.vertices, time);
    const x = 4 + (time - start) * 310 / windowMs;
    const y = 255 + (point.value - mean) * scale;
    const segment = curve.vertices[point.index].segment;
    if (point.visible && previousVisible && segment === previousSegment) {
      let x1 = previousX, y1 = previousY, x2 = x, y2 = y;
      if ((y1 < -4 && y2 < -4) || (y1 > 514 && y2 > 514)) drawing = false;
      else {
        if (y1 < -4 || y1 > 514) {
          const edge = Math.max(-4, Math.min(514, y1));
          x1 += (x2 - x1) * (edge - y1) / (y2 - y1); y1 = edge; drawing = false;
        }
        if (y2 < -4 || y2 > 514) {
          const edge = Math.max(-4, Math.min(514, y2));
          x2 = x1 + (x2 - x1) * (edge - y1) / (y2 - y1); y2 = edge;
        }
        if (!drawing) path += `M${x1.toFixed(4)},${y1.toFixed(4)}`;
        path += `L${x2.toFixed(4)},${y2.toFixed(4)}`;
        drawing = y >= -4 && y <= 514;
      }
    } else drawing = false;
    previousX = x; previousY = y; previousSegment = segment; previousVisible = point.visible;
    if (time === last) break;
    time = Math.min(last, (Math.floor(time / step + 0.000001) + 1) * step);
  }
  return path;
}

/** Marker interpolation matches the tile's polyline exactly, including its tip. */
export function rasterCursor(curve: SignalCurve, time: number, windowMs: number) {
  'worklet';
  const step = windowMs / 160;
  const first = curve.vertices[0].time, last = curve.vertices[curve.vertices.length - 1].time;
  const low = Math.max(first, Math.floor(time / step) * step);
  const high = Math.min(last, (Math.floor(time / step) + 1) * step);
  const a = curveAt(curve.vertices, low), b = curveAt(curve.vertices, high);
  const connected = curve.vertices[a.index].segment === curve.vertices[b.index].segment;
  return { value: high > low ? a.value + (b.value - a.value) * (time - low) / (high - low) : a.value,
    visible: connected && a.visible && b.visible };
}
