import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Path, Line } from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import type { SignalPoint } from "@/lib/plant-session";
import { colors } from "./plantia-theme";
const AnimatedPath = Animated.createAnimatedComponent(Path);
const WIDTH = 320,
  HEIGHT = 140,
  COUNT = 120;
function makePath(values: number[], progress: number, previous: number[]) {
  "worklet";
  let d = "";
  for (let i = 0; i < values.length; i++) {
    const y = previous[i] + (values[i] - previous[i]) * progress;
    d += `${i ? "L" : "M"}${((i * WIDTH) / (COUNT - 1)).toFixed(2)},${y.toFixed(2)} `;
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
  useEffect(() => {
    if (!points.length) return;
    const end = points[points.length - 1].time;
    const min = Math.min(...points.map((p) => p.value)),
      max = Math.max(...points.map((p) => p.value));
    const padding = Math.max(2, (max - min) * 0.2),
      low = min - padding,
      range = max - min + padding * 2;
    let cursor = 0;
    const values = Array.from({ length: COUNT }, (_, i) => {
      const time = end - 12000 + (i / (COUNT - 1)) * 12000;
      while (cursor < points.length - 1 && points[cursor + 1].time <= time) cursor++;
      if (time < points[0].time) return HEIGHT / 2;
      return HEIGHT - ((points[cursor].value - low) / range) * HEIGHT;
    });
    previous.value = next.value.map(
      (v, i) => previous.value[i] + (v - previous.value[i]) * progress.value,
    );
    next.value = values;
    progress.value = 0;
    progress.value = withTiming(1, { duration: 100, easing: Easing.linear });
  }, [points, next, previous, progress]);
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
        <Text style={styles.axisText}>−12 s</Text>
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
