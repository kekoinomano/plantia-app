import { useIsFocused } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';
import Animated, { runOnJS, useAnimatedProps, useAnimatedStyle, useFrameCallback, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { plantSession, usePlantSessionValue, type SignalPoint } from '@/lib/plant-session';
import { INITIAL_SIGNAL_TIMING, SIGNAL_WINDOW_MS, type SignalTiming } from '@/lib/signal-chart';
import { curveAt, curveExtrema, prepareSignalCurve, rasterSignalPath, rasterCursor, type SignalCurve } from '@/lib/signal-curve';
import { getWaveInspection, subscribeWaveInspection } from '@/lib/wave-music/inspection';
import { colors } from './saviasound-theme';
const AnimatedPath = Animated.createAnimatedComponent(Path);
const WIDTH = 320, HEIGHT = 170;
const PLOT_LEFT = 4, PLOT_RIGHT = WIDTH - 6, PLOT_WIDTH = PLOT_RIGHT - PLOT_LEFT;
const EMPTY_CURVE: SignalCurve = { reference: 0, vertices: [], treeSize: 1, minima: [Infinity, Infinity], maxima: [-Infinity, -Infinity] };
const EMPTY = { ...EMPTY_CURVE, anchor: 0, now: 0, latest: 0, packetMs: 200, delayMs: 250 };
const MIN_WINDOW_MS = 1000, MAX_WINDOW_MS = 10000;

/** Only the chart subscriber renders on incoming packets. */
export function LiveSignalChart({ waiting, accent = colors.green }: { waiting: boolean; accent?: string }) {
  const live = usePlantSessionValue(s => s.signal === 'live');
  const focused = useIsFocused();
  // Stop the off-screen frame callback while the laboratory is open.
  return focused ? <SignalChart stream live={live} waiting={waiting} accent={accent} /> : null;
}
const NO_POINTS: SignalPoint[] = [];
export const SignalChart = memo(function SignalChart({ points = NO_POINTS, live, waiting, timing = INITIAL_SIGNAL_TIMING, stream = false, accent = colors.green }: {
  points?: SignalPoint[]; live: boolean; waiting: boolean; timing?: SignalTiming; stream?: boolean; accent?: string;
}) {
  const [layoutWidth, setLayoutWidth] = useState(WIDTH);
  const [windowMs, setWindowMs] = useState(SIGNAL_WINDOW_MS);
  const shape = useSharedValue(EMPTY), clock = useSharedValue(0);
  const drawnPath = useSharedValue('');
  const greetingGlow = useSharedValue(0);
  const showCursor = useSharedValue(false);
  const tile = useSharedValue({ end: 0, mean: 0, range: 1000, window: SIGNAL_WINDOW_MS, anchor: -1, builtAt: 0 });
  const transform = useSharedValue({ x: 0, y: -170, sx: 1, sy: 1, cursorY: 85, cursorOpacity: 0 });
  const foreground = useRef(AppState.currentState === 'active');
  const active = useSharedValue(foreground.current);
  const running = useSharedValue(false);
  const horizontalWindow = useSharedValue(SIGNAL_WINDOW_MS);
  const pinchStart = useSharedValue(SIGNAL_WINDOW_MS);
  const verticalAmplitude = useSharedValue(1000);
  const targetAmplitude = useSharedValue(1000);
  const nextScaleAt = useSharedValue(0);
  const presentationDelay = useSharedValue(250);
  const lastPaintAt = useSharedValue(0);
  const initializedRange = useSharedValue(false);
  const needsAnchor = useRef(true);
  const redraw = useRef<() => void>(() => {});
  const commitWindow = useCallback((value: number) => setWindowMs(Math.round(value / 100) * 100), []);
  const pinch = useMemo(() => Gesture.Pinch()
    .onStart(() => { pinchStart.value = horizontalWindow.value; })
    .onUpdate(event => {
      horizontalWindow.value = Math.max(MIN_WINDOW_MS, Math.min(MAX_WINDOW_MS, pinchStart.value / event.scale));
    })
    .onEnd(() => { runOnJS(commitWindow)(horizontalWindow.value); }),
  [commitWindow, horizontalWindow, pinchStart]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      foreground.current = state === 'active';
      active.value = foreground.current;
      if (state === 'active') { needsAnchor.current = true; redraw.current(); }

    });
    return () => sub.remove();
  }, [active]);
  useEffect(() => { running.value = live || waiting; showCursor.value = live; }, [live, waiting, running, showCursor]);
  useEffect(() => {
    if (!stream) return;
    let lastGreeting = getWaveInspection()?.summary.lastGreeting;
    return subscribeWaveInspection(() => {
      const greeting = getWaveInspection()?.summary.lastGreeting;
      if (!greeting) { lastGreeting = greeting; return; }
      if (greeting === lastGreeting) return;
      lastGreeting = greeting;
      if (!foreground.current) return;
      greetingGlow.value = 0;
      greetingGlow.value = withSequence(
        withTiming(0.32, { duration: 180 }),
        withTiming(0, { duration: 850 }),
      );
    });
  }, [stream, greetingGlow]);
  useEffect(() => {
    // The stream has an imperative, capped publication channel. Packet updates
    // never render React controls or reconcile a tree of animated SVG elements.
    const update = () => {
      const snapshot = stream ? plantSession.getSnapshot() : null;
      const sourcePoints = snapshot?.points ?? points;
      const sourceTiming = snapshot?.signalTiming ?? timing;
      if (!sourcePoints.length) {
        shape.value = EMPTY; drawnPath.value = ''; needsAnchor.current = true; initializedRange.value = false;
        nextScaleAt.value = 0;
        tile.value = { end: 0, mean: 0, range: 1000, window: SIGNAL_WINDOW_MS, anchor: -1, builtAt: 0 }; return;
      }
      const curve = prepareSignalCurve(sourcePoints);
      const now = performance.now(), wallNow = Date.now();
      const latest = sourcePoints[sourcePoints.length - 1].time;
      if (needsAnchor.current) {
        clock.value = Math.max(sourcePoints[0].time, Math.min(latest, now - sourceTiming.delayMs));
        presentationDelay.value = sourceTiming.delayMs;
        lastPaintAt.value = 0;
        nextScaleAt.value = 0;
        needsAnchor.current = false;
      }
      shape.value = { ...curve, anchor: wallNow, now, latest,
        packetMs: sourceTiming.packetMs, delayMs: sourceTiming.delayMs };
    };
    const publish = () => { if (foreground.current) update(); };
    redraw.current = update;
    publish();
    if (stream) return plantSession.subscribeGraph(publish);
  }, [stream, points, timing, shape, drawnPath, clock, presentationDelay, lastPaintAt, initializedRange, nextScaleAt, tile]);
  useFrameCallback(frame => {
    if (!active.value || !shape.value.anchor) return;
    // Advance playback at most 60 times/s, including on 120 Hz displays. Use wall time
    // for playback so missed frames never create a queue of old measurements.
    const sincePaint = frame.timestamp - lastPaintAt.value;
    if (lastPaintAt.value && sincePaint < 15.9) return;
    const elapsed = lastPaintAt.value ? Math.max(0, sincePaint) : 16;
    lastPaintAt.value = frame.timestamp;
    const s = shape.value;
    if (running.value) {
      const difference = s.delayMs - presentationDelay.value;
      // Adapt gently, but discard an obsolete slow-sensor reserve immediately
      // when reception accelerates. Excess lag must never accumulate for seconds.
      presentationDelay.value = Math.min(s.delayMs + Math.max(150, s.delayMs * 0.1),
        presentationDelay.value + Math.max(-elapsed * 0.5, Math.min(elapsed * 0.25, difference)));
      const desired = s.now + (Date.now() - s.anchor) - presentationDelay.value;
      const end = Math.max(s.vertices[0].time, Math.min(s.latest, desired));
      if (end > clock.value) clock.value = end;
      // When input stops, reach the final sample after just the chosen reserve,
      // then stop exactly there (no asymptotic crawl through historical data).
    }
    const end = clock.value;
    const window = horizontalWindow.value;
    const left = curveAt(s.vertices, end - window);
    const right = curveAt(s.vertices, end);
    const duration = right.duration - left.duration;
    const mean = duration > 0 ? (right.area - left.area) / duration : right.value;
    const extrema = curveExtrema(s, left.index + 1, right.index);
    const peak = Math.max(0.01,
      Math.abs(left.value - mean), Math.abs(right.value - mean),
      Number.isFinite(extrema.low) ? Math.abs(extrema.low - mean) : 0,
      Number.isFinite(extrema.high) ? Math.abs(extrema.high - mean) : 0);
    const targetRange = peak * 1.18;
    if (!initializedRange.value) {
      verticalAmplitude.value = targetRange;
      targetAmplitude.value = targetRange;
      initializedRange.value = true;
      nextScaleAt.value = frame.timestamp + 1000;
    } else if (frame.timestamp >= nextScaleAt.value) {
      // Re-evaluate exactly from what is visible. A large historical value no
      // longer keeps the current trace compressed after it leaves the screen.
      targetAmplitude.value = targetRange;
      nextScaleAt.value = frame.timestamp + 1000;
    }
    const scaleDifference = targetAmplitude.value - verticalAmplitude.value;
    verticalAmplitude.value = Math.abs(scaleDifference) < targetAmplitude.value * 0.001
      ? targetAmplitude.value
      : verticalAmplitude.value + scaleDifference * (1 - Math.exp(-elapsed / 180));
    let raster = tile.value;
    const range = verticalAmplitude.value;
    const meanAbsolute = s.reference + mean;
    // The SVG changes at most 8 times/s. Between updates only the cached native
    // layer moves; there is no path parsing/tessellation on every display frame.
    const needsRebase = raster.anchor < 0 || end - raster.end > raster.window * 0.4
      || Math.abs(window / raster.window - 1) > 0.02
      || Math.abs(range / raster.range - 1) > 0.05
      || Math.abs(meanAbsolute - raster.mean) > range * 0.5;
    if (raster.anchor < 0 || ((needsRebase || raster.anchor !== s.anchor) && frame.timestamp - raster.builtAt >= 125)) {
      // New packets append in the same tile coordinates. Do not reset its origin
      // on each arrival: that would make texture replacement and translation race.
      if (needsRebase) raster = { ...raster, end, mean: meanAbsolute, range, window };
      drawnPath.value = rasterSignalPath(s, raster.end, raster.window, raster.mean - s.reference, raster.range);
      raster = { ...raster, anchor: s.anchor, builtAt: frame.timestamp };
      tile.value = raster;
    }
    const sx = raster.window / window, sy = raster.range / range;
    const cursor = rasterCursor(s, end, raster.window);
    const cursorY = HEIGHT / 2 + (cursor.value - mean) * 71 / range;
    transform.value = {
      x: PLOT_RIGHT * (1 - sx) - (end - raster.end) * PLOT_WIDTH / window,
      y: HEIGHT / 2 - 255 * sy + (raster.mean - meanAbsolute) * 71 / range,
      sx, sy, cursorY,
      cursorOpacity: showCursor.value && cursor.visible && cursorY >= 2 && cursorY <= HEIGHT - 2 ? 1 : 0,
    };
  });
  const lineProps = useAnimatedProps(() => ({ d: drawnPath.value }));
  const glowProps = useAnimatedProps(() => ({ d: drawnPath.value, opacity: greetingGlow.value }));
  const layerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: transform.value.x * layoutWidth / WIDTH }, { translateY: transform.value.y },
      { scaleX: transform.value.sx }, { scaleY: transform.value.sy }],
  }));
  const cursorStyle = useAnimatedStyle(() => ({
    opacity: transform.value.cursorOpacity,
    transform: [{ translateY: transform.value.cursorY - 2 }],
  }));
  return <View style={styles.container}>
    <GestureDetector gesture={pinch}>
    <View style={styles.plot} accessible accessibilityRole="image"
      accessibilityLabel={`Señal de tu planta. ${windowMs / 1000} segundos visibles. Escala vertical automática.`}
      accessibilityHint="Junta o separa dos dedos para cambiar el tiempo visible">
      <View pointerEvents="none" onLayout={event => setLayoutWidth(event.nativeEvent.layout.width)} style={StyleSheet.absoluteFill}>
        <View style={styles.midline} />
        <View style={[styles.viewport, { width: layoutWidth * PLOT_RIGHT / WIDTH }]}>
          <Animated.View pointerEvents="none" renderToHardwareTextureAndroid shouldRasterizeIOS
            style={[styles.layer, { width: layoutWidth * 2 }, layerStyle]}>
            <Svg width={layoutWidth * 2} height={510} viewBox="0 0 640 510" preserveAspectRatio="none">
              <AnimatedPath animatedProps={glowProps} fill="none" stroke={accent}
                strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
              <AnimatedPath animatedProps={lineProps} fill="none" stroke={live ? accent : '#A6B09F'}
                strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Animated.View>
        </View>
        <Animated.View style={[styles.cursor, { left: layoutWidth * PLOT_RIGHT / WIDTH - 2, backgroundColor: accent }, cursorStyle]} />
      </View>
    </View>
    </GestureDetector>
    <View style={styles.captionRow}>
      <Text style={styles.caption}>SEÑAL VIVA · AUTO</Text>
      <Text style={styles.caption}>{(windowMs / 1000).toFixed(windowMs % 1000 ? 1 : 0)} S · PINZA PARA AJUSTAR</Text>
    </View>
  </View>;
});
const styles = StyleSheet.create({
  container: { width: '100%' },
  plot: { height: HEIGHT, overflow: 'hidden' },
  viewport: { height: HEIGHT, overflow: 'hidden' },
  layer: { position: 'absolute', top: 0, left: 0, height: 510, transformOrigin: 'top left' },
  cursor: { position: 'absolute', top: 0, width: 4, height: 4, borderRadius: 2 },
  midline: { position: 'absolute', top: HEIGHT / 2, left: 4, right: 6, height: StyleSheet.hairlineWidth, backgroundColor: colors.line, opacity: .55 },
  captionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  caption: { color: colors.muted, fontSize: 9, letterSpacing: 1.1, fontVariant: ['tabular-nums'] },
});
