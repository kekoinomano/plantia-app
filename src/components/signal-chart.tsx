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
// SVG's native matrix is accepted by G.setNativeProps, but omitted from GProps.
const AnimatedGroup = Animated.createAnimatedComponent(G<{ matrix?: number[] }>);
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
    const update = () => {
      if (!points.length) {
        scale.current = null;
      }
      const now = performance.now();
      const wallNow = Date.now();
      const visibleEnd = now - REVEAL_DELAY_MS;
      const data = points.filter((point) =>
        point.time >= visibleEnd - WINDOW_MS && point.time <= visibleEnd,
      );
      // Only real, currently visible samples set the scale, never gap fillers
      // or buffered future peaks. Refresh even when no packet arrives.
      const values = data.map((point) => point.value);
      if (values.length) {
        const min = Math.min(...values), max = Math.max(...values);
        // Padding depends on variation, never on the absolute sensor baseline.
        const padding = Math.max(0.000001, (max - min) * 0.12);
        const previous = scale.current;
        // Refit both bounds on overflow so a shifted signal cannot hug an edge.
        if (!previous || max - min < (previous.high - previous.low) * 0.5 ||
            min < previous.low || max > previous.high) {
          scale.current = { low: min - padding, high: max + padding };
        }
      }
      const { low, high } = scale.current ?? { low: -1, high: 1 };
      const readings = data.map((point) => ({
        x: WIDTH - (now - REVEAL_DELAY_MS - point.time) * WIDTH / WINDOW_MS,
        y: Math.max(10, Math.min(HEIGHT - 10, HEIGHT - 14 - (point.value - low) / Math.max(0.000001, high - low) * (HEIGHT - 28))),
        time: point.time,
      }));
      const neutral = (time: number) => ({
        x: WIDTH - (visibleEnd - time) * WIDTH / WINDOW_MS,
        y: HEIGHT / 2, time,
      });
      const vertices = [] as typeof readings;
      if (!readings.length || readings[0].time > visibleEnd - WINDOW_MS + 600)
        vertices.push(neutral(visibleEnd - WINDOW_MS));
      for (const point of readings) {
        const last = vertices[vertices.length - 1];
        if (last && point.time - last.time > 600) {
          vertices.push(neutral(last.time + 300), neutral(point.time - 150));
        }
        vertices.push(point);
      }
      const last = vertices[vertices.length - 1];
      if (last && visibleEnd - last.time > 600)
        vertices.push(neutral(last.time + 300));
      // Keep the leading point present, including while waiting for the next
      // packet. Short gaps hold the last reading; longer gaps return to centre.
      const tip = vertices[vertices.length - 1];
      vertices.push({ ...neutral(now + 300), y: tip?.y ?? HEIGHT / 2 });
      let path = "";
      const segments: Segment[] = [];
      for (let i = 0; i < vertices.length; i++) {
        const point = vertices[i];
        const a = vertices[i - 1];
        if (!a) {
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
    };
    update();
    const timer = setInterval(() => {
      if (active.value && (live || waiting)) update();
    }, 100);
    return () => clearInterval(timer);
  }, [points, live, waiting, active, shape, clock]);

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
    return { cy: HEIGHT / 2, opacity: 1 };
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
