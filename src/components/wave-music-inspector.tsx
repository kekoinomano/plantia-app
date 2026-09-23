import { useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './plantia-theme';
import { getWaveInspection, subscribeWaveInspection, type WindowReadout } from '../lib/wave-music/inspection';

const ROLES: Record<string, string> = { foundation: 'acordes', contour: 'melodía', detail: 'respuesta',
  accompaniment: 'acompañamiento', counter: 'adornos', bass: 'bajo', percussion: 'batería', texture: 'fondo' };
const num = (value: unknown, digits = 0) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
const label = (value: unknown) => typeof value === 'string' ? value : '—';

function WindowCard({ data, planned }: { data: WindowReadout; planned: boolean }) {
  return <View style={styles.window}>
    <Text style={styles.heading}>{data.seconds} s · análisis #{data.analysis}</Text>
    <Text style={styles.text}>Ajuste {num(data.explained, 1)} % / objetivo {data.target} % · {data.waves.length}/8 ondas</Text>
    <Text style={styles.small}>Periodo medio {num(data.mean, 3)} ms · error RMS {num(data.rmse, 3)} ms</Text>
    {data.waves.map(wave => <View key={wave.id} style={styles.wave}>
      <View style={styles.row}>
        <Text style={styles.waveTitle}>Onda {wave.rank + 1} · #{wave.id}</Text>
        <Text style={styles.weight}>{num(wave.weight * 100, 1)} % de peso</Text>
      </View>
      <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(0, Math.min(100, wave.weight * 100))}%` }]} /></View>
      <Text style={styles.text}>Aporta +{num(wave.improvement, 1)} puntos al ajuste.</Text>
      <Text style={styles.small}>{num(wave.frequency, 3)} ciclos/s analizado · amplitud {num(wave.amplitude, 3)} ms</Text>
      {data.seconds === 3 && <Text style={styles.small}>Campo ponderado disponible: {num(wave.cycles, 2)} ciclos por motivo · fase {num(wave.phase, 2)} rad</Text>}
      <Text style={styles.small}>Seguimiento aproximado: {num(wave.age, 1)} s del eje analizado.</Text>
      {planned && <Text style={styles.role}>{wave.roles.length
        ? `Interviene en ${wave.roles.map(r => ROLES[r] ?? r).join(', ')} · ${wave.notes} ataques del plan.`
        : 'Sin ataques asignados directamente en este compás.'}</Text>}
    </View>)}
    {!data.waves.length && <Text style={styles.text}>No se han obtenido componentes útiles en esta ventana.</Text>}
  </View>;
}

/** Mounted only when requested. Subscribes to musical decisions, not raw BLE. */
const idleSubscribe = () => () => {};
export function WaveMusicInspector({ connected, playing, paused = false }: { connected: boolean; playing: boolean; paused?: boolean }) {
  const liveSnapshot = useSyncExternalStore(paused ? idleSubscribe : subscribeWaveInspection, getWaveInspection, getWaveInspection);
  const frozen = useRef(liveSnapshot);
  if (!paused) frozen.current = liveSnapshot;
  const snapshot = paused ? frozen.current : liveSnapshot;
  const [showLatest, setShowLatest] = useState(false);
  const summary = snapshot?.summary ?? {};
  const isPlan = connected && playing && (snapshot?.decision === 'wave-bar' || snapshot?.decision === 'arranged-rest');
  const waiting = !connected ? 'Conecta una planta para ver sus ondas y decisiones musicales.' : !playing
    ? 'La salida está silenciada; el análisis y la composición siguen avanzando.' : snapshot?.decision === 'stale-analysis'
      ? 'Esperando datos recientes. Las voces se están retirando.'
      : snapshot?.decision === 'constant-window' || snapshot?.decision === 'measured-rest'
        ? 'La variación es muy pequeña: el mood está dejando espacio.'
        : `Reuniendo la primera ventana: ${num(Math.min(3, snapshot?.collectedSeconds ?? 0), 1)} / 3 s del sensor. Después completaremos la de 8 s.`;
  return <View style={styles.card}>
    <Text style={styles.title}>Ahora mismo</Text>
    {!isPlan ? <Text accessibilityLiveRegion="polite" style={styles.text}>{waiting}</Text> : <>
      <Text style={styles.chord}>{label(summary.chord)} · {num(summary.bpm)} BPM</Text>
      <Text style={styles.text}>{label(summary.key)} · {label(summary.style)}</Text>
      {summary.intro === true && <Text style={styles.text}>{summary.warmingUp === true
        ? 'Introducción con la ventana real de 3 s. La de 8 s aún se está reuniendo.'
        : 'La ventana de 8 s ya está lista; la armonía se incorporará en el siguiente límite de frase.'}</Text>}
      <Text style={styles.text}>Frase {num(summary.phrase)} · {label(summary.phase)}</Text>
      <Text style={styles.text}>{label(summary.arrangement)}</Text>
      {Array.isArray(summary.phraseRoles) && <Text style={styles.small}>Recorrido de esta frase: {summary.phraseRoles.filter((r): r is string => typeof r === 'string').join(' → ')}. Fuente #{num(summary.arrangementAnalysis)}.</Text>}
      <Text style={styles.text}>Tempo objetivo: {num(summary.tempoTarget, 1)} BPM · se aproxima cada dos compases.</Text>
      <Text style={styles.small}>Media corta: {num(summary.shortMean, 4)} ms · media de {num(summary.meanWindowSeconds)} s: {num(summary.mean, 4)} ms. Para el tempo: {num(summary.tempoMean, 4)} ms (análisis #{num(summary.tempoAnalysis)}). Referencia inicial: {num(summary.referenceMean, 4)} ms.</Text>
      <Text style={styles.small}>Desde el último ataque hasta el final: {num(summary.restBeats, 1)} tiempos. Puede continuar una nota sostenida o su efecto.</Text>
      {typeof summary.peakPitchedVoices === 'number' && <>
        <Text style={styles.text}>Base y melodía comparten armonía. Las duraciones incluyen la caída de las notas.</Text>
        <Text style={styles.small}>Máximo previsto: {num(summary.peakPitchedVoices)} voces con altura simultáneas · {num(summary.shortenedNotes)} duraciones ajustadas · {num(summary.omittedNotes)} ataques retirados por espacio. Incluye caída de las notas, no reverberación.</Text>
      </>}
      {typeof summary.voiceLimit === 'number' && <Text style={styles.small}>Límite del mood: {num(summary.voiceLimit)} voces afinadas, una reservada para el saludo. Los efectos pueden seguir sonando.</Text>}
      <Text style={styles.text}>Melodía: {num(summary.melodyNotes)} notas · {num(summary.attacks)} ataques entre todas las capas.</Text>
      <Text style={styles.text}>Base: {label(summary.base)} · saludo: {num(summary.greetingCount)} eventos detectados.</Text>
      <Text style={styles.text}>Instrumentos del tema: {label(summary.lead)} · respuesta: {label(summary.detail)}</Text>
      <Text style={styles.small}>Intensidad musical {num(typeof summary.activity === 'number' ? summary.activity * 100 : undefined)} % · swing {num(typeof summary.swing === 'number' ? summary.swing * 100 : undefined)} %</Text>
      <Text style={styles.small}>Variación relativa medida {num(typeof summary.relativeVariation === 'number' ? summary.relativeVariation * 100 : undefined, 2)} % · evolución musical {num(typeof summary.evolution === 'number' ? summary.evolution * 100 : undefined)} %</Text>
      <Text style={styles.text}>El motivo viene del análisis #{num(summary.motifAnalysis)} y la armonía del #{num(summary.harmonyAnalysis)}. {typeof summary.motifPolicy === 'string' ? summary.motifPolicy : 'El piano desarrolla una pregunta y resolución de dos compases; la identidad se conserva durante la frase.'}</Text>
      <Text style={styles.small}>Versión del motivo: {num(summary.motifRevision)} · cambio de señal: {num(summary.signalChange, 2)} · anchura espectral: {num(summary.spectralWidth, 2)}. Son escalas musicales, no indicadores biológicos.</Text>
      <Text style={styles.small}>Plan #{snapshot?.barAnalysis} · último análisis #{snapshot?.latestAnalysis} · audio en cola ≈ {num(snapshot?.queueSeconds, 1)} s.</Text>
    </>}
    <Text style={styles.small}>Este panel muestra el plan enviado al audio; puede adelantarse a lo que oyes por la cola de reproducción. Los pesos describen el ajuste, no porcentajes de volumen ni actividad biológica.</Text>
    {snapshot && connected && playing && <>
      <View style={styles.tabs}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: !showLatest }} onPress={() => setShowLatest(false)} style={[styles.tab, !showLatest && styles.selected]}>
          <Text style={styles.tabText}>Ondas del compás</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: showLatest }} onPress={() => setShowLatest(true)} style={[styles.tab, showLatest && styles.selected]}>
          <Text style={styles.tabText}>Último análisis</Text>
        </Pressable>
      </View>
      <Text style={styles.small}>{showLatest
        ? 'Datos recién analizados. Se incorporan respetando el compás y la frase actuales.'
        : 'Fuentes reales de las notas del plan. Puede haber análisis anteriores: son el motivo y la armonía que se están desarrollando. Los conteos se solapan cuando varias ondas intervienen en una nota.'}</Text>
      {(showLatest ? snapshot.latest : snapshot.sources).map(window =>
        <WindowCard key={`${window.analysis}:${window.seconds}`} data={window} planned={!showLatest} />)}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: 18, borderRadius: 24, backgroundColor: colors.paper, gap: 11 },
  title: { fontSize: 21, color: colors.ink },
  chord: { fontSize: 25, color: colors.green },
  heading: { fontSize: 15, fontWeight: '600', color: colors.ink },
  text: { fontSize: 12, lineHeight: 19, color: colors.ink },
  small: { fontSize: 11, lineHeight: 17, color: colors.muted },
  window: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14, gap: 6 },
  wave: { paddingVertical: 10, gap: 5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  waveTitle: { fontSize: 12, fontWeight: '600', color: colors.ink },
  weight: { fontSize: 12, color: colors.green },
  track: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.soft },
  fill: { height: 4, backgroundColor: colors.green },
  role: { fontSize: 11, lineHeight: 18, color: colors.green },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tab: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.soft },
  selected: { backgroundColor: colors.sage },
  tabText: { fontSize: 12, color: colors.ink },
});
