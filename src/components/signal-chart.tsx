import { memo, useEffect, useId, useRef } from "react";
import { AppState, StyleSheet, View } from "react-native";
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";
import type { SignalPoint } from "@/lib/plant-session";
import { colors } from "./plantia-theme";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedGroup = Animated.createAnimatedComponent(G);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const WIDTH = 320;
const HEIGHT = 170;
const WINDOW_MS = 5000;
const REVEAL_DELAY_MS = 250;
type Segment = { x1: number; x2: number; y1: number; y2: number; c1: number; c2: number };
const EMPTY = { path: "", anchor: 0, segments: [] as Segment[] };

export const SignalChart = memo(function SignalChart({ points, live, waiting }: {
  points: SignalPoint[];
  live: boolean;
  waiting: boolean;
}) {
  const clipId = `signal-${useId().replace(/:/g, "")}`;
  const firstSample = useRef<number | null>(null);
  const shape = useSharedValue(EMPTY);
  const clock = useSharedValue(0);
  const active = useSharedValue(AppState.currentState === "active");
  const running = useSharedValue(false);
  const scale = useRef<{ low: number; high: number } | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      active.value = state === "active";
    });
    return () => subscription.remove();
  }, [active]);
  useEffect(() => { running.value = live || waiting; }, [live, waiting, running]);

  useEffect(() => {
    if (!points.length) {
      shape.value = EMPTY;
      scale.current = null;
      firstSample.current = null;
      return;
    }
    if (firstSample.current === null) firstSample.current = points[0].time;
    // Collect a few readings before choosing a scale; one startup spike must
    // not define the amplitude of the entire first window.
    if (points[points.length - 1].time - firstSample.current < 300) return;
    const now = performance.now();
    const wallNow = Date.now();
    const data = points.filter((point) => point.time >= now - WINDOW_MS - 200);
    if (!data.length) {
      shape.value = EMPTY;
      return;
    }
    // Use actual visible extrema, including peaks previously discarded by trimming.
    const visibleEnd = now - REVEAL_DELAY_MS;
    const values = data.filter((point) =>
      point.time >= visibleEnd - WINDOW_MS && point.time <= visibleEnd,
    ).map((point) => point.value);
    if (!values.length) return;
    const min = Math.min(...values), max = Math.max(...values);
    // Padding depends on variation, never on the absolute sensor baseline.
    const padding = Math.max(0.000001, (max - min) * 0.12);
    const previous = scale.current;
    // After initialization, the ONLY rescale trigger is less than 50% height.
    // No periodic recentering, expansion or ongoing animation of the Y axis.
    if (!previous || max - min < (previous.high - previous.low) * 0.5) {
      scale.current = { low: min - padding, high: max + padding };
    }
    const { low, high } = scale.current!;
    const vertices = data.map((point) => ({
      x: WIDTH - (now - REVEAL_DELAY_MS - point.time) * WIDTH / WINDOW_MS,
      y: Math.max(10, Math.min(HEIGHT - 10, HEIGHT - 14 - (point.value - low) / Math.max(0.000001, high - low) * (HEIGHT - 28))),
      time: point.time,
    }));
    let path = "";
    const segments: Segment[] = [];
    for (let i = 0; i < vertices.length; i++) {
      const point = vertices[i];
      const a = vertices[i - 1];
      if (!a || point.time - a.time > 600) {
        path += `M${point.x.toFixed(2)},${point.y.toFixed(2)}`;
        continue;
      }
      // Bounded curves soften the trace without adding peaks between readings.
      const before = vertices[Math.max(0, i - 2)];
      const after = vertices[Math.min(vertices.length - 1, i + 1)];
      const lower = Math.min(a.y, point.y), upper = Math.max(a.y, point.y);
      const c1 = Math.max(lower, Math.min(upper, a.y + (point.y - before.y) / 6));
      const c2 = Math.max(lower, Math.min(upper, point.y - (after.y - a.y) / 6));
      const dx = (point.x - a.x) / 3;
      segments.push({ x1: a.x, x2: point.x, y1: a.y, y2: point.y, c1, c2 });
      path += `C${(a.x + dx).toFixed(2)},${c1.toFixed(2)} ${(point.x - dx).toFixed(2)},${c2.toFixed(2)} ${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    }
    // Rebase geometry and its timestamp together. The UI clock uses the same
    // wall-time origin, never a separately accumulated frame counter.
    shape.value = { path, anchor: wallNow, segments: segments.slice(-12) };
    clock.value = wallNow;
  }, [points, shape, clock]);

  // Only translate the existing path at 30 fps. No path construction, sample
  // interpolation or React renders on each animation frame.
  useFrameCallback(() => {
    if (!active.value || !running.value || !shape.value.anchor) return;
    const now = Date.now();
    if (now - clock.value >= 32) clock.value = now;
  });
  const groupProps = useAnimatedProps(() => ({
    matrix: [1, 0, 0, 1, -Math.max(0, clock.value - shape.value.anchor) * WIDTH / WINDOW_MS, 0] as [number, number, number, number, number, number],
  }));
  const lineProps = useAnimatedProps(() => ({ d: shape.value.path }));
  const cursorProps = useAnimatedProps(() => {
    const x = WIDTH + Math.max(0, clock.value - shape.value.anchor) * WIDTH / WINDOW_MS;
    for (const segment of shape.value.segments) {
      if (x < segment.x1 || x > segment.x2 || segment.x2 <= segment.x1) continue;
      const t = (x - segment.x1) / (segment.x2 - segment.x1), u = 1 - t;
      return { cy: u * u * u * segment.y1 + 3 * u * u * t * segment.c1 + 3 * u * t * t * segment.c2 + t * t * t * segment.y2, opacity: 1 };
    }
    return { cy: HEIGHT / 2, opacity: 0 };
  });

  return (
    <View style={styles.plot} accessibilityLabel={points.length ? "El pulso de tu planta" : waiting ? "Esperando la señal de tu planta" : "Sin señal"}>
      <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
        <Defs><ClipPath id={clipId}><Rect x={0} y={0} width={WIDTH} height={HEIGHT} /></ClipPath></Defs>
        <G clipPath={`url(#${clipId})`}>
          <AnimatedGroup animatedProps={groupProps}>
            <AnimatedPath animatedProps={lineProps} fill="none" stroke={colors.green} strokeOpacity={0.06} strokeWidth={5} strokeLinecap="round" />
            <AnimatedPath animatedProps={lineProps} fill="none" stroke={live ? colors.green : "#A6B09F"} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
          </AnimatedGroup>
          {live && <AnimatedCircle animatedProps={cursorProps} cx={WIDTH - 1.5} r={2} fill={colors.green} />}
        </G>
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  plot: { height: HEIGHT, width: "100%", marginTop: 24, marginBottom: 4, overflow: "hidden" },
});
