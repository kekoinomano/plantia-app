import { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Path, Line } from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import type { SignalPoint } from "@/lib/plant-session";
import {
  createSignalChartFrame,
  formatSignalHistory,
  SIGNAL_SAMPLE_COUNT,
} from "@/lib/signal-chart";
import { colors } from "./plantia-theme";
const AnimatedPath = Animated.createAnimatedComponent(Path);
const WIDTH = 320,
  HEIGHT = 140,
  COUNT = SIGNAL_SAMPLE_COUNT;

function clamp(value: number, low: number, high: number) {
  "worklet";
  return Math.max(low, Math.min(high, value));
}

function makePath(values: number[], progress: number, previous: number[]) {
  "worklet";
  if (!values.length) return "";
  const y = values.map((value, i) => previous[i] + (value - previous[i]) * progress);
  const step = WIDTH / Math.max(1, values.length - 1);
  let d = `M0,${y[0].toFixed(2)} `;

  // A bounded Catmull-Rom curve passes through every sample without ringing
  // above or below sharp sensor changes.
  for (let i = 0; i < y.length - 1; i++) {
    const y0 = y[Math.max(0, i - 1)];
    const y1 = y[i];
    const y2 = y[i + 1];
    const y3 = y[Math.min(y.length - 1, i + 2)];
    const low = Math.min(y1, y2);
    const high = Math.max(y1, y2);
    const cp1y = clamp(y1 + ((y2 - y0) * 0.7) / 6, low, high);
    const cp2y = clamp(y2 - ((y3 - y1) * 0.7) / 6, low, high);
    d += `C${(i * step + step / 3).toFixed(2)},${cp1y.toFixed(2)} `;
    d += `${((i + 1) * step - step / 3).toFixed(2)},${cp2y.toFixed(2)} `;
    d += `${((i + 1) * step).toFixed(2)},${y2.toFixed(2)} `;
  }
  return d;
}
export function SignalChart({
  points,
  live,
  waiting,
}: {
  points: SignalPoint[];
  live: boolean;
  waiting: boolean;
}) {
  const previous = useSharedValue(Array(COUNT).fill(HEIGHT / 2) as number[]);
  const next = useSharedValue(Array(COUNT).fill(HEIGHT / 2) as number[]);
  const progress = useSharedValue(1);
  const frame = useMemo(() => createSignalChartFrame(points, HEIGHT), [points]);
  useEffect(() => {
    if (!frame.values.length) return;
    previous.value = next.value.map(
      (v, i) => previous.value[i] + (v - previous.value[i]) * progress.value,
    );
    next.value = frame.values;
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: 360,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
  }, [frame, next, previous, progress]);
  const lineProps = useAnimatedProps(() => ({
    d: makePath(next.value, progress.value, previous.value),
  }));
  const areaProps = useAnimatedProps(() => ({
    d: `${makePath(next.value, progress.value, previous.value)}L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`,
  }));
  return (
    <View
      accessibilityLabel={
        live
          ? "Gráfica de los últimos doce segundos de la señal de tu planta"
          : "Esperando datos de la planta"
      }
    >
      <View style={styles.plot}>
        <Svg
          width="100%"
          height={HEIGHT}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
        >
          <Defs>
            <LinearGradient id="signalFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#8DAB7A" stopOpacity={0.35} />
              <Stop offset="1" stopColor="#8DAB7A" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {[30, 70, 110].map((y) => (
            <Line
              key={y}
              x1={0}
              y1={y}
              x2={WIDTH}
              y2={y}
              stroke={colors.line}
              strokeDasharray="3 6"
            />
          ))}
          {points.length > 0 && (
            <>
              <AnimatedPath animatedProps={areaProps} fill="url(#signalFill)" />
              <AnimatedPath
                animatedProps={lineProps}
                fill="none"
                stroke={live ? colors.green : "#A6B09F"}
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}
        </Svg>
        {!points.length && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {waiting ? "Un momento para conectar." : "Cada planta tiene su propio ritmo."}
            </Text>
            <Text style={styles.emptyText}>
              {waiting ? "Esperando las primeras lecturas…" : "Su señal aparecerá aquí."}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.axis}>
        <Text style={styles.axisText}>{formatSignalHistory(frame.historyMs)}</Text>
        <Text style={styles.axisText}>ahora</Text>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  plot: { height: HEIGHT, marginTop: 15 },
  empty: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", gap: 7 },
  emptyTitle: {
    color: colors.muted,
    fontSize: 13,
    backgroundColor: colors.paper,
    paddingHorizontal: 6,
  },
  emptyText: {
    color: "#9CA394",
    fontSize: 11,
    backgroundColor: colors.paper,
    paddingHorizontal: 6,
  },
  axis: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  axisText: { color: colors.muted, fontSize: 10 },
});
