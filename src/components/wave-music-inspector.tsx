import { useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from '@/lib/i18n';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './saviasound-theme';
import { getWaveInspection, subscribeWaveInspection, type WindowReadout } from '../lib/wave-music/inspection';

const ROLES: Record<string, string> = { foundation: 'acordes', contour: 'melodía', detail: 'respuesta',
  accompaniment: 'acompañamiento', counter: 'adornos', bass: 'bajo', percussion: 'batería', texture: 'fondo' };
const num = (value: unknown, digits = 0) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
const label = (value: unknown) => typeof value === 'string' ? value : '—';

function WindowCard({ data, planned }: { data: WindowReadout; planned: boolean }) {
  const { t } = useTranslation();
  return <View style={styles.window}>
    <Text style={styles.heading}>{data.seconds} s · {t('análisis')} #{data.analysis}</Text>
    <Text style={styles.text}>{t('Ajuste')} {num(data.explained, 1)} % / {t('objetivo')} {data.target} % · {data.waves.length}/8 {t('ondas')}</Text>
    <Text style={styles.small}>{t('Periodo medio')} {num(data.mean, 3)} ms · error RMS {num(data.rmse, 3)} ms</Text>
    {data.waves.map(wave => <View key={wave.id} style={styles.wave}>
      <View style={styles.row}>
        <Text style={styles.waveTitle}>{t('Onda')} {wave.rank + 1} · #{wave.id}</Text>
        <Text style={styles.weight}>{num(wave.weight * 100, 1)} % {t('de peso')}</Text>
      </View>
      <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(0, Math.min(100, wave.weight * 100))}%` }]} /></View>
      <Text style={styles.text}>{t('Aporta')} +{num(wave.improvement, 1)} {t('puntos al ajuste.')}</Text>
      <Text style={styles.small}>{num(wave.frequency, 3)} {t('ciclos/s analizado · amplitud')} {num(wave.amplitude, 3)} ms</Text>
      {data.seconds === 3 && <Text style={styles.small}>{t('Campo ponderado disponible:')} {num(wave.cycles, 2)} {t('ciclos por motivo · fase')} {num(wave.phase, 2)} rad</Text>}
      <Text style={styles.small}>{t('Seguimiento aproximado:')} {num(wave.age, 1)} s {t('del eje analizado.')}</Text>
      {planned && <Text style={styles.role}>{wave.roles.length
        ? `${t('Interviene en')} ${wave.roles.map(r => t(ROLES[r] ?? r)).join(', ')} · ${wave.notes} ${t('ataques del plan.')}`
        : t('Sin ataques asignados directamente en este compás.')}</Text>}
    </View>)}
    {!data.waves.length && <Text style={styles.text}>{t('No se han obtenido componentes útiles en esta ventana.')}</Text>}
  </View>;
}

/** Mounted only when requested. Subscribes to musical decisions, not raw BLE. */
const idleSubscribe = () => () => {};
export function WaveMusicInspector({ connected, playing, paused = false }: { connected: boolean; playing: boolean; paused?: boolean }) {
  const { t, musicLabel } = useTranslation();
  const liveSnapshot = useSyncExternalStore(paused ? idleSubscribe : subscribeWaveInspection, getWaveInspection, getWaveInspection);
  const frozen = useRef(liveSnapshot);
  if (!paused) frozen.current = liveSnapshot;
  const snapshot = paused ? frozen.current : liveSnapshot;
  const [showLatest, setShowLatest] = useState(false);
  const summary = snapshot?.summary ?? {};
  const isPlan = connected && playing && (snapshot?.decision === 'wave-bar' || snapshot?.decision === 'arranged-rest');
  const waiting = !connected ? t('Conecta tu dispositivo saviasound para ver las ondas de la planta y las decisiones musicales.') : !playing
    ? t('La salida está silenciada; el análisis y la composición siguen avanzando.') : snapshot?.decision === 'stale-analysis'
      ? t('Esperando datos recientes. Las voces se están retirando.')
      : snapshot?.decision === 'constant-window' || snapshot?.decision === 'measured-rest'
        ? t('La variación es muy pequeña: el mood está dejando espacio.')
        : `${t('Reuniendo la primera ventana:')} ${num(Math.min(3, snapshot?.collectedSeconds ?? 0), 1)} / 3 s ${t('del sensor. Después completaremos la de 8 s.')}`;
  return <View style={styles.card}>
    <Text style={styles.title}>{t('Ahora mismo')}</Text>
    {!isPlan ? <Text accessibilityLiveRegion="polite" style={styles.text}>{waiting}</Text> : <>
      <Text style={styles.chord}>{musicLabel(label(summary.chord))} · {num(summary.bpm)} BPM</Text>
      <Text style={styles.text}>{musicLabel(label(summary.key))} · {t(label(summary.style))}</Text>
      {summary.intro === true && <Text style={styles.text}>{summary.warmingUp === true
        ? t('Introducción con la ventana real de 3 s. La de 8 s aún se está reuniendo.')
        : t('La ventana de 8 s ya está lista; la armonía se incorporará en el siguiente límite de frase.')}</Text>}
      <Text style={styles.text}>{t('Frase')} {num(summary.phrase)} · {t(label(summary.phase))}</Text>
      <Text style={styles.text}>{t(label(summary.arrangement))}</Text>
      {Array.isArray(summary.phraseRoles) && <Text style={styles.small}>{t('Recorrido de esta frase:')} {summary.phraseRoles.filter((r): r is string => typeof r === 'string').map(t).join(' → ')}. {t('Fuente')} #{num(summary.arrangementAnalysis)}.</Text>}
      <Text style={styles.text}>{t('Tempo objetivo:')} {num(summary.tempoTarget, 1)} BPM · {t('se aproxima cada dos compases.')}</Text>
      <Text style={styles.small}>{t('Media corta:')} {num(summary.shortMean, 4)} ms · {t('media de')} {num(summary.meanWindowSeconds)} s: {num(summary.mean, 4)} ms. {t('Para el tempo:')} {num(summary.tempoMean, 4)} ms ({t('análisis')} #{num(summary.tempoAnalysis)}). {t('Referencia inicial:')} {num(summary.referenceMean, 4)} ms.</Text>
      <Text style={styles.small}>{t('Desde el último ataque hasta el final:')} {num(summary.restBeats, 1)} {t('tiempos. Puede continuar una nota sostenida o su efecto.')}</Text>
      {typeof summary.peakPitchedVoices === 'number' && <>
        <Text style={styles.text}>{t('Base y melodía comparten armonía. Las duraciones incluyen la caída de las notas.')}</Text>
        <Text style={styles.small}>{t('Máximo previsto:')} {num(summary.peakPitchedVoices)} {t('voces con altura simultáneas')} · {num(summary.shortenedNotes)} {t('duraciones ajustadas')} · {num(summary.omittedNotes)} {t('ataques retirados por espacio. Incluye caída de las notas, no reverberación.')}</Text>
      </>}
      {typeof summary.voiceLimit === 'number' && <Text style={styles.small}>{t('Límite del mood:')} {num(summary.voiceLimit)} {t('voces afinadas, una reservada para el saludo. Los efectos pueden seguir sonando.')}</Text>}
      <Text style={styles.text}>{t('Melodía:')} {num(summary.melodyNotes)} {t('notas')} · {num(summary.attacks)} {t('ataques entre todas las capas.')}</Text>
      <Text style={styles.text}>{t('Base:')} {label(summary.base)} · {t('saludo:')} {num(summary.greetingCount)} {t('eventos detectados.')}</Text>
      <Text style={styles.text}>{t('Instrumentos del tema:')} {t(label(summary.lead))} · {t('respuesta')}: {t(label(summary.detail))}</Text>
      <Text style={styles.small}>{t('Intensidad musical')} {num(typeof summary.activity === 'number' ? summary.activity * 100 : undefined)} % · swing {num(typeof summary.swing === 'number' ? summary.swing * 100 : undefined)} %</Text>
      <Text style={styles.small}>{t('Variación relativa medida')} {num(typeof summary.relativeVariation === 'number' ? summary.relativeVariation * 100 : undefined, 2)} % · {t('evolución musical')} {num(typeof summary.evolution === 'number' ? summary.evolution * 100 : undefined)} %</Text>
      <Text style={styles.text}>{t('El motivo viene del análisis')} #{num(summary.motifAnalysis)} {t('y la armonía del')} #{num(summary.harmonyAnalysis)}. {typeof summary.motifPolicy === 'string' ? t(summary.motifPolicy) : t('El piano desarrolla una pregunta y resolución de dos compases; la identidad se conserva durante la frase.')}</Text>
      <Text style={styles.small}>{t('Versión del motivo:')} {num(summary.motifRevision)} · {t('cambio de señal:')} {num(summary.signalChange, 2)} · {t('anchura espectral:')} {num(summary.spectralWidth, 2)}. {t('Son escalas musicales, no indicadores biológicos.')}</Text>
      <Text style={styles.small}>{t('Plan')} #{snapshot?.barAnalysis} · {t('último análisis')} #{snapshot?.latestAnalysis} · {t('audio en cola')} ≈ {num(snapshot?.queueSeconds, 1)} s.</Text>
    </>}
    <Text style={styles.small}>{t('Este panel muestra el plan enviado al audio; puede adelantarse a lo que oyes por la cola de reproducción. Los pesos describen el ajuste, no porcentajes de volumen ni actividad biológica.')}</Text>
    {snapshot && connected && playing && <>
      <View style={styles.tabs}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: !showLatest }} onPress={() => setShowLatest(false)} style={[styles.tab, !showLatest && styles.selected]}>
          <Text style={styles.tabText}>{t('Ondas del compás')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: showLatest }} onPress={() => setShowLatest(true)} style={[styles.tab, showLatest && styles.selected]}>
          <Text style={styles.tabText}>{t('Último análisis')}</Text>
        </Pressable>
      </View>
      <Text style={styles.small}>{showLatest
        ? t('Datos recién analizados. Se incorporan respetando el compás y la frase actuales.')
        : t('Fuentes reales de las notas del plan. Puede haber análisis anteriores: son el motivo y la armonía que se están desarrollando. Los conteos se solapan cuando varias ondas intervienen en una nota.')}</Text>
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
