import { Stack, useRouter } from 'expo-router';
import { useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, BackHandler, Image, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/plant-icon';
import { SignalChart } from '@/components/signal-chart';
import { colors, moodPalette } from '@/components/saviasound-theme';
import { plantSession, usePlantControls } from '@/lib/plant-session';
import { prepareSignalCurve } from '@/lib/signal-curve';
import { profile } from '@/lib/sonora/focus';
import { SaviasoundCamera, videoCapture } from '@/lib/video-capture';
import { MAX_RECORDING_MINUTES } from '@/lib/recordings';
import { getWaveInspection, subscribeWaveInspection } from '@/lib/wave-music/inspection';

type Phase = 'idle' | 'starting' | 'recording' | 'saving';

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const SIGNAL_BANNER_TIMEOUT_MS = 10_000;
const SIGNAL_BANNER_FADE_MS = 650;

function publishVideoOverlay(mood: string, color: string) {
  const state = plantSession.getSnapshot();
  const curve = prepareSignalCurve(state.points);
  const vertices: number[] = [];
  for (const point of curve.vertices) {
    vertices.push(point.time, point.value + curve.reference, point.segment ?? 0,
      point.a, point.b, point.c);
  }
  videoCapture.setOverlay(vertices, mood.toUpperCase(), parseInt(color.replace('#', ''), 16),
    state.signalTiming.delayMs, performance.now(), Date.now());
}

export default function VideoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const state = usePlantControls();
  const mood = profile(state.config.profile);
  const palette = moodPalette(mood.id);
  const [permission, requestCameraPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [lastVideo, setLastVideo] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [plotHeight, setPlotHeight] = useState(85);
  const [bannerVisible, setBannerVisible] = useState(false);
  const bannerOpacity = useRef(new Animated.Value(0)).current;
  const startedAt = useRef(0);
  const busy = useRef(false);
  const stopAudio = useRef<(() => void) | null>(null);
  const recording = phase === 'recording';
  const ready = permission?.granted && state.connection === 'connected' && state.signal === 'live' && state.audioReady && state.playing;

  useEffect(() => {
    if (!permission?.granted) return;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    let latestTime = 0;
    const checkSignal = () => {
      const points = plantSession.getSnapshot().points;
      const time = points[points.length - 1]?.time ?? 0;
      if (time === latestTime) return;
      latestTime = time;
      if (hideTimer) clearTimeout(hideTimer);
      const remaining = SIGNAL_BANNER_TIMEOUT_MS - (performance.now() - time);
      setBannerVisible(time > 0 && remaining > 0);
      if (time > 0 && remaining > 0) hideTimer = setTimeout(() => setBannerVisible(false), remaining);
    };
    checkSignal();
    const unsubscribe = plantSession.subscribeGraph(checkSignal);
    return () => { unsubscribe(); if (hideTimer) clearTimeout(hideTimer); };
  }, [permission?.granted]);

  useEffect(() => {
    Animated.timing(bannerOpacity, {
      toValue: bannerVisible ? 1 : 0,
      duration: SIGNAL_BANNER_FADE_MS,
      useNativeDriver: true,
    }).start();
  }, [bannerOpacity, bannerVisible]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !permission?.granted || !state.playing) return;
    plantSession.setVideoAudioPriority(true);
    return () => plantSession.setVideoAudioPriority(false);
  }, [permission?.granted, state.playing]);

  useEffect(() => {
    if (!permission?.granted || phase !== 'recording') return;
    const update = () => publishVideoOverlay(mood.name, palette.wash);
    update();
    return plantSession.subscribeGraph(update);
  }, [permission?.granted, mood.name, palette.wash, phase]);

  useEffect(() => {
    if (phase !== 'recording') return;
    let lastGreeting = getWaveInspection()?.summary.lastGreeting;
    return subscribeWaveInspection(() => {
      const greeting = getWaveInspection()?.summary.lastGreeting;
      if (!greeting || greeting === lastGreeting) { lastGreeting = greeting; return; }
      lastGreeting = greeting;
      videoCapture.greet();
    });
  }, [phase]);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 300);
    return () => clearInterval(timer);
  }, [recording]);

  const stop = useCallback(async () => {
    if (busy.current || phase !== 'recording') return;
    busy.current = true;
    setPhase('saving');
    try {
      stopAudio.current?.();
      stopAudio.current = null;
      const uri = await videoCapture.stop();
      setLastVideo(uri);
      setMessage('Vídeo MP4 creado. Puedes guardarlo en Fotos o compartirlo.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el vídeo.');
    } finally {
      setPhase('idle');
      busy.current = false;
    }
  }, [phase]);

  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => phase !== 'idle');
    return () => back.remove();
  }, [phase]);

  useEffect(() => {
    if (!recording) return;
    const subscription = AppState.addEventListener('change', value => {
      if (value === 'background') void stop();
    });
    return () => subscription.remove();
  }, [recording, stop]);

  useEffect(() => {
    if (recording && seconds >= MAX_RECORDING_MINUTES * 60) void stop();
  }, [recording, seconds, stop]);

  useEffect(() => {
    if (recording && !state.playing) void stop();
  }, [recording, state.playing, stop]);

  const start = async () => {
    if (busy.current || !ready) return;
    busy.current = true;
    setMessage(null);
    setLastVideo(null);
    setPhase('starting');
    let cameraStarted = false;
    try {
      publishVideoOverlay(mood.name, palette.wash);
      await videoCapture.start(plantSession.getVideoSampleRate());
      cameraStarted = true;
      stopAudio.current = plantSession.captureVideoAudio(videoCapture.appendAudio);
      startedAt.current = Date.now();
      setSeconds(0);
      setPhase('recording');
    } catch (error) {
      stopAudio.current?.();
      stopAudio.current = null;
      if (cameraStarted) void videoCapture.stop().catch(() => {});
      setPhase('idle');
      setMessage(error instanceof Error ? error.message : 'No se pudo empezar a grabar.');
    } finally {
      busy.current = false;
    }
  };

  const save = async () => {
    if (!lastVideo || busy.current) return;
    busy.current = true;
    try {
      if (Platform.OS === 'android' && Number(Platform.Version) < 29) {
        const grant = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
        if (grant !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Permite guardar el vídeo para continuar.');
      }
      await videoCapture.save(lastVideo);
      setMessage('Vídeo guardado en Fotos.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar en Fotos.');
    } finally { busy.current = false; }
  };

  const share = async () => {
    if (!lastVideo) return;
    try { await Sharing.shareAsync(lastVideo, { mimeType: 'video/mp4', UTI: 'public.mpeg-4' }); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo compartir el vídeo.'); }
  };

  return <View style={styles.root}>
    <Stack.Screen options={{ gestureEnabled: phase === 'idle' }} />
    <StatusBar hidden />
    {permission?.granted ? <SaviasoundCamera style={StyleSheet.absoluteFill} />
      : <View style={[StyleSheet.absoluteFill, styles.cameraFallback]} />}
    {permission?.granted && <Animated.View style={[styles.signalOverlay, { opacity: bannerOpacity }]} pointerEvents="none">
      <View style={styles.signalContent}>
        <View style={styles.signalHeader}>
          <Image source={require('../../assets/images/saviasound-logo.png')} style={styles.signalBrand} resizeMode="contain" />
          <View style={styles.signalLive}><View style={[styles.signalDot, { backgroundColor: palette.wash }]} /><Text style={styles.signalLiveText}>SEÑAL VIVA</Text></View>
        </View>
        <View style={styles.signalGraph} onLayout={event => setPlotHeight(event.nativeEvent.layout.height)}>
          <View style={{ height: 170, transform: [{ scaleY: plotHeight / 170 }], transformOrigin: 'top left' }}>
            <SignalChart stream live={state.signal === 'live'} waiting={state.connection === 'connected'} accent={palette.wash} />
          </View>
        </View>
        <Text style={[styles.signalMood, { bottom: Math.max(insets.bottom, 12) + 8 }]}>{mood.name.toUpperCase()}</Text>
      </View>
    </Animated.View>}
    <SafeAreaView style={styles.safe}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" disabled={phase !== 'idle'} onPress={() => router.back()} style={styles.back}>
          <Icon name="back" size={20} color="#FFFFFF" />
        </Pressable>
      </View>
      <View style={styles.space} />
      {message && <View style={styles.message}><Text style={styles.messageText}>{message}</Text></View>}
      {!permission?.granted ? <Pressable style={styles.permissionButton} onPress={() => void requestCameraPermission()}>
        <Text style={styles.permissionText}>Permitir cámara</Text>
      </Pressable> : <>
        {phase !== 'idle' && <Text style={styles.timer}>{recording ? `● REC  ${formatTime(seconds)}` : phase === 'saving' ? 'CREANDO MP4…' : 'PREPARANDO…'}</Text>}
        <View style={styles.controls}>
          <View style={styles.controlSide} />
          <Pressable accessibilityRole="button" accessibilityLabel={recording ? 'Detener vídeo' : 'Grabar vídeo'}
            accessibilityState={{ disabled: phase !== 'recording' && !ready }}
            disabled={phase === 'saving' || phase === 'starting' || (phase === 'idle' && !ready)}
            onPress={() => void (recording ? stop() : start())}
            style={[styles.shutter, recording && styles.shutterRecording, phase === 'idle' && !ready && styles.shutterDisabled]}>
            <View style={recording ? styles.stopSquare : styles.recordCircle} />
          </Pressable>
          <View style={styles.controlSide} />
        </View>
        {!ready && phase === 'idle' && <Text style={styles.hint}>Conecta la planta y activa su música para grabar.</Text>}
        {lastVideo && phase === 'idle' && <View style={styles.resultActions}>
          <Pressable style={styles.resultButton} onPress={() => void save()}><Text style={styles.resultText}>Guardar en Fotos</Text></Pressable>
          <Pressable style={styles.resultButton} onPress={() => void share()}><Text style={styles.resultText}>Compartir MP4</Text></Pressable>
        </View>}
      </>}
    </SafeAreaView>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#101711' },
  cameraFallback: { backgroundColor: '#18241B' },
  safe: { flex: 1, paddingHorizontal: 18, paddingBottom: 18 },
  top: { flexDirection: 'row', alignItems: 'center', height: 54 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  signalOverlay: { position: 'absolute', top: '68%', left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(18,32,25,.72)', borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,.16)' },
  signalContent: { width: '100%', height: '100%' },
  signalHeader: { position: 'absolute', top: '7%', left: '5%', right: '5%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  signalBrand: { width: 100, height: 18, tintColor: '#F8F5EE' },
  signalLive: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  signalDot: { width: 5, height: 5, borderRadius: 3 },
  signalLiveText: { color: 'rgba(248,245,238,.72)', fontSize: 9, fontWeight: '700', letterSpacing: 1.4 },
  signalGraph: { position: 'absolute', top: '20%', left: '5%', width: '90%', height: '55%', overflow: 'hidden' },
  signalMood: { position: 'absolute', left: 0, right: 0, color: '#FFFFFF', fontSize: 13, fontWeight: '700', letterSpacing: 2.2, textAlign: 'center' },
  space: { flex: 1 },
  message: { backgroundColor: 'rgba(18,30,22,.9)', borderRadius: 14, padding: 12, marginBottom: 12 },
  messageText: { color: '#FFFFFF', textAlign: 'center', fontSize: 13 },
  timer: { color: '#FFFFFF', textAlign: 'center', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 15 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 45 },
  controlSide: { width: 72 },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  shutterRecording: { borderColor: '#E57764' },
  shutterDisabled: { opacity: .4 },
  recordCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#E57764' },
  stopSquare: { width: 30, height: 30, borderRadius: 5, backgroundColor: '#E57764' },
  hint: { color: '#FFFFFF', textAlign: 'center', fontSize: 12, marginTop: 13 },
  resultActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  resultButton: { flex: 1, backgroundColor: colors.paper, paddingVertical: 13, borderRadius: 13, alignItems: 'center' },
  resultText: { color: colors.ink, fontWeight: '700', fontSize: 12 },
  permissionButton: { backgroundColor: colors.paper, padding: 16, borderRadius: 14, alignItems: 'center' },
  permissionText: { color: colors.ink, fontWeight: '700' },
});
