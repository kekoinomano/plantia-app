import { useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "@/components/plant-icon";
import { LivingPattern, WaveMark } from "@/components/saviasound-visuals";
import { LiveSignalChart } from "@/components/signal-chart";
import { colors, moodPalette } from "@/components/saviasound-theme";
import { plantSession, usePlantControls, type PlantIndicators } from "@/lib/plant-session";
import { profile } from "@/lib/sonora/focus";
import { listRecordings, MAX_RECORDING_MINUTES } from "@/lib/recordings";

const readings: { key: keyof PlantIndicators; title: string; low: string; high: string; explanation: string }[] = [
  { key: "speed", title: "Velocidad", low: "MÁS LENTA", high: "MÁS RÁPIDA",
    explanation: "Muestra si la señal de tu planta va más rápida o más lenta que de costumbre durante esta conexión." },
  { key: "amplitude", title: "Amplitud", low: "MENOR", high: "MAYOR",
    explanation: "Muestra si los altibajos de la señal son más grandes o más pequeños que los habituales durante esta conexión." },
  { key: "change", title: "Cambio", low: "PARECIDO", high: "DISTINTO",
    explanation: "Muestra cuánto cambia la señal de un momento a otro, comparado con lo habitual durante esta conexión." },
  { key: "stability", title: "Constancia", low: "CAMBIANTE", high: "ESTABLE",
    explanation: "Muestra si la señal ha mantenido un comportamiento parecido durante el último medio minuto o si ha ido cambiando." },
];

function ReadingBar({ value, color }: { value: number | null; color: string }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ?? 0,
      duration: 1700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, value]);
  return <View style={styles.track}>
    {value !== null && <Animated.View style={[styles.fill, {
      width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
      backgroundColor: color,
    }]} />}
  </View>;
}

export default function HomeScreen() {
  const router = useRouter();
  const [openReading, setOpenReading] = useState<(typeof readings)[number] | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [recordingName, setRecordingName] = useState("");
  const state = usePlantControls();
  const mood = profile(state.config.profile);
  const palette = moodPalette(mood.id);
  const bluetoothConnected = state.connection === "connected";
  const connected = bluetoothConnected || !!state.replay;
  const busy = state.connection === "scanning" || state.connection === "connecting" || state.connection === "disconnecting";
  const status = bluetoothConnected ? state.device || "Planta conectada" : busy ? "Conectando…" : "Sin conectar";
  const openRecordName = () => {
    setRecordingName(`Grabación ${listRecordings().length + 1}`);
    setNameOpen(true);
  };

  return <SafeAreaView style={[styles.safe, { backgroundColor: palette.wash }]} edges={["top", "bottom"]}>
    <LivingPattern color={palette.accent} />
    <ScrollView style={styles.scroll} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Image source={require("../../assets/images/saviasound-logo.png")} style={styles.brand} resizeMode="contain" accessibilityLabel="saviasound" />
        <View style={styles.headerActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Bluetooth. ${status}`}
            onPress={() => router.push("/bluetooth" as Href)} style={styles.bluetooth}>
            <View style={[styles.statusDot, { backgroundColor: bluetoothConnected ? palette.accent : colors.muted }]} />
            <Icon name="bluetooth" size={18} color={bluetoothConnected ? colors.ink : colors.muted} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir menú"
            onPress={() => setMenuOpen(true)} style={styles.bluetooth}>
            <Icon name="menu" size={20} color={colors.ink} />
          </Pressable>
        </View>
      </View>

      <View style={styles.signalArea}>
        <LiveSignalChart waiting={connected || busy} accent={palette.accent} />
      </View>

      <View style={styles.readings}>
        {readings.map(reading => {
          const value = connected && state.signal === "live" ? state.indicators[reading.key] : null;
          return <Pressable key={reading.key} accessibilityRole="button"
            accessibilityLabel={`${reading.title}. ${value === null ? "Esperando señal" : value < .35 ? reading.low : value > .65 ? reading.high : "Nivel habitual"}. Toca para saber más.`}
            onPress={() => setOpenReading(reading)} style={styles.reading}>
            <Text style={styles.readingTitle}>{reading.title}</Text>
            <ReadingBar value={value} color={palette.accent} />
          </Pressable>;
        })}
      </View>

      {state.error && <Pressable accessibilityRole="alert" onPress={plantSession.clearError} style={styles.error}>
        <Text style={styles.errorText}>{state.error}</Text><Icon name="close" size={15} color={colors.amber} />
      </Pressable>}

      <View style={styles.bottom}>
        {state.recording && <View style={styles.recordingStatus}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingStatusText}>GRABANDO · {Math.floor(state.recording.durationMs / 60_000)}:{String(Math.floor(state.recording.durationMs / 1000) % 60).padStart(2, "0")}</Text>
        </View>}
        {state.replay && <View style={styles.replayBar}>
          <View style={{ flex: 1 }}><Text style={styles.replayTitle}>{state.replay.name}</Text>
            <Text style={styles.replayTime}>{Math.floor(state.replay.positionMs / 1000)} / {Math.floor(state.replay.durationMs / 1000)} s</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={state.replay.paused ? "Reanudar grabación" : "Pausar grabación"}
            onPress={plantSession.toggleReplayPause}><Icon name={state.replay.paused ? "play" : "pause"} size={20} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Detener reproducción" onPress={plantSession.stopReplay}>
            <Icon name="close" size={20} /></Pressable>
        </View>}
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Información musical"
            onPress={() => router.push("/mood-info" as Href)} style={styles.roundButton}>
            <Icon name="info" size={21} color={colors.ink} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Editar mood"
            onPress={() => router.push("/mood-edit" as Href)} style={styles.roundButton}>
            <Icon name="edit" size={20} color={colors.ink} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable accessibilityRole="button" accessibilityLabel={state.recording ? "Detener grabación" : "Iniciar grabación"}
            accessibilityState={{ disabled: !state.recording && (!bluetoothConnected || state.signal !== "live") }}
            disabled={!state.recording && (!bluetoothConnected || state.signal !== "live")}
            onPress={() => state.recording ? plantSession.stopRecording() : openRecordName()}
            style={[styles.roundButton, !state.recording && (!bluetoothConnected || state.signal !== "live") && styles.disabled,
              state.recording && styles.recordingButton]}>
            <Icon name="record" size={17} color={state.recording ? colors.amber : colors.ink} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={state.replay?.paused ? "Reproducción en pausa" : !state.audioReady && connected ? "Preparando música" : state.playing ? "Silenciar música" : "Reanudar música"}
            accessibilityState={{ disabled: !state.audioReady || !!state.replay?.paused }} disabled={!state.audioReady || !!state.replay?.paused}
            onPress={plantSession.togglePlayback} style={[styles.roundButton, (!state.audioReady || !!state.replay?.paused) && styles.disabled]}>
            <Icon name="sound" muted={!state.playing} size={21} color={colors.ink} />
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Cambiar mood. Actual: ${mood.name}`}
          onPress={() => router.push("/moods" as Href)} style={[styles.moodCard, { backgroundColor: palette.deep }]}>
          <View style={styles.moodCopy}>
            <Text style={[styles.moodKicker, { color: palette.wash }]}>MOOD</Text>
            <Text style={styles.moodName}>{mood.name}</Text>
            <Text numberOfLines={2} style={styles.moodDescription}>{mood.description}</Text>
          </View>
          <View style={styles.moodMark}><WaveMark color={palette.accent} width={94} /></View>
          <Icon name="chevron" size={18} color={palette.wash} />
        </Pressable>
      </View>
    </ScrollView>
    <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
      <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
        <Pressable style={styles.menuPanel} onPress={() => {}}>
          <Text style={styles.menuKicker}>SAVIASOUND</Text>
          <Text style={styles.menuHeading}>Tu espacio</Text>
          <Pressable accessibilityRole="button" onPress={() => { setMenuOpen(false); router.push("/recordings" as Href); }} style={styles.menuRow}>
            <Icon name="wave" size={20} /><Text style={styles.menuRowText}>Grabaciones</Text><Icon name="chevron" size={16} />
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
    <Modal visible={nameOpen} transparent animationType="fade" onRequestClose={() => setNameOpen(false)}>
      <View style={styles.backdrop}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Nueva grabación</Text>
          <Text style={styles.infoCopy}>Ponle un nombre. Se guardarán los datos de la planta durante un máximo de {MAX_RECORDING_MINUTES} minutos.</Text>
          <TextInput value={recordingName} onChangeText={setRecordingName} maxLength={70} selectTextOnFocus
            accessibilityLabel="Nombre de la grabación" style={styles.nameInput} />
          <View style={styles.dialogActions}>
            <Pressable onPress={() => setNameOpen(false)}><Text style={styles.secondaryText}>Cancelar</Text></Pressable>
            <Pressable onPress={() => { plantSession.startRecording(recordingName); setNameOpen(false); }} style={styles.dialogPrimary}>
              <Text style={styles.primaryText}>Grabar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
    <Modal visible={openReading !== null} transparent animationType="fade" onRequestClose={() => setOpenReading(null)}>
      <Pressable style={styles.backdrop} onPress={() => setOpenReading(null)}>
        <Pressable style={styles.infoCard} onPress={() => {}}>
          <View style={styles.infoHeading}>
            <Text style={styles.infoTitle}>{openReading?.title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar explicación" onPress={() => setOpenReading(null)} style={styles.infoClose}>
              <Icon name="close" size={18} color={colors.ink} />
            </Pressable>
          </View>
          <Text style={styles.infoCopy}>{openReading?.explanation}</Text>
        </Pressable>
      </Pressable>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  page: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 10 },
  header: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  brand: { width: 142, height: 25 },
  headerActions: { flexDirection: "row", gap: 9 },
  bluetooth: { width: 42, height: 42, borderRadius: 21, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, backgroundColor: "rgba(248,245,238,.74)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(31,40,24,.18)" },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  bluetoothText: { color: colors.ink, fontSize: 11, flexShrink: 1 },
  signalArea: { paddingTop: 12 },
  readings: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 18, marginTop: 26, marginBottom: 22 },
  reading: { width: "47%", minHeight: 46, paddingVertical: 5, gap: 11 },
  readingTitle: { color: colors.ink, fontSize: 12, letterSpacing: .1 },
  track: { height: 4, borderRadius: 2, backgroundColor: "rgba(31,40,24,.13)", overflow: "hidden" },
  fill: { height: "100%", borderRadius: 2 },
  error: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.amber, paddingVertical: 10 },
  errorText: { color: colors.amber, fontSize: 11, lineHeight: 16, flex: 1 },
  bottom: { gap: 14, marginTop: "auto" },
  actions: { flexDirection: "row", gap: 10 },
  roundButton: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(248,245,238,.76)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(31,40,24,.18)" },
  recordingButton: { borderColor: colors.amber, backgroundColor: "rgba(217,117,68,.12)" },
  recordingStatus: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7 },
  recordingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.amber },
  recordingStatusText: { color: colors.amber, fontSize: 9, letterSpacing: 1.2 },
  replayBar: { flexDirection: "row", alignItems: "center", gap: 20, backgroundColor: colors.paper, borderRadius: 18, padding: 15 },
  replayTitle: { color: colors.ink, fontSize: 12 },
  replayTime: { color: colors.muted, fontSize: 10, marginTop: 4 },
  disabled: { opacity: .34 },
  moodCard: { minHeight: 128, borderRadius: 28, flexDirection: "row", alignItems: "center", overflow: "hidden", paddingHorizontal: 21, paddingVertical: 20 },
  moodCopy: { flex: 1, zIndex: 1 },
  moodKicker: { fontSize: 9, letterSpacing: 1.8, opacity: .72, marginBottom: 8 },
  moodName: { color: colors.paper, fontSize: 24, letterSpacing: -.4, marginBottom: 7 },
  moodDescription: { color: colors.paper, opacity: .68, fontSize: 11, lineHeight: 16, maxWidth: 230 },
  moodMark: { position: "absolute", right: 30, top: 12, opacity: .35 },
  backdrop: { flex: 1, justifyContent: "center", padding: 28, backgroundColor: "rgba(20,28,17,.35)" },
  menuBackdrop: { flex: 1, alignItems: "flex-end", backgroundColor: "rgba(20,28,17,.35)" },
  menuPanel: { width: "82%", maxWidth: 330, height: "100%", backgroundColor: colors.paper, paddingHorizontal: 26, paddingTop: 80 },
  menuKicker: { color: colors.muted, fontSize: 9, letterSpacing: 2 },
  menuHeading: { color: colors.ink, fontSize: 30, marginTop: 12, marginBottom: 32 },
  menuRow: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 15, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  menuRowText: { color: colors.ink, fontSize: 15, flex: 1 },
  nameInput: { color: colors.ink, borderBottomWidth: 1, borderBottomColor: colors.green, paddingVertical: 12, fontSize: 16 },
  dialogActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 22, marginTop: 8 },
  dialogPrimary: { backgroundColor: colors.forest, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20 },
  primaryText: { color: colors.paper, fontSize: 13 },
  secondaryText: { color: colors.muted, fontSize: 13 },
  infoCard: { backgroundColor: colors.paper, borderRadius: 24, padding: 24, gap: 16 },
  infoHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  infoTitle: { color: colors.ink, fontSize: 22, letterSpacing: -.5 },
  infoClose: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  infoCopy: { color: colors.ink, fontSize: 14, lineHeight: 22 },
});
