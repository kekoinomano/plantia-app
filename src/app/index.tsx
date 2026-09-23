import { useRouter, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "@/components/plant-icon";
import { LivingPattern, WaveMark } from "@/components/muromura-visuals";
import { LiveSignalChart } from "@/components/signal-chart";
import { colors, moodPalette } from "@/components/plantia-theme";
import { plantSession, usePlantControls } from "@/lib/plant-session";
import { profile } from "@/lib/sonora/focus";

export default function HomeScreen() {
  const router = useRouter();
  const state = usePlantControls();
  const mood = profile(state.config.profile);
  const palette = moodPalette(mood.id);
  const connected = state.connection === "connected";
  const busy = state.connection === "scanning" || state.connection === "connecting" || state.connection === "disconnecting";
  const status = connected ? state.device || "Planta conectada" : busy ? "Conectando…" : "Sin conectar";

  return <SafeAreaView style={[styles.safe, { backgroundColor: palette.wash }]} edges={["top", "bottom"]}>
    <LivingPattern color={palette.accent} />
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <WaveMark color={colors.ink} width={39} />
          <Text style={styles.wordmark}>MUROMURA</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Bluetooth. ${status}`}
          onPress={() => router.push("/bluetooth" as Href)} style={styles.bluetooth}>
          <View style={[styles.statusDot, { backgroundColor: connected ? palette.accent : colors.muted }]} />
          <Icon name="bluetooth" size={17} color={colors.ink} />
          <Text numberOfLines={1} style={styles.bluetoothText}>{status}</Text>
        </Pressable>
      </View>

      <View style={styles.signalArea}>
        <View style={styles.signalHeading}>
          <View>
            <Text style={styles.kicker}>{connected ? "ESCUCHANDO" : "SEÑAL"}</Text>
            <Text style={styles.signalTitle}>{connected ? "Tu planta, ahora" : "Conecta para escuchar"}</Text>
          </View>
          {connected && <View style={[styles.livePill, { borderColor: palette.accent }]}>
            <View style={[styles.liveDot, { backgroundColor: palette.accent }]} />
            <Text style={[styles.liveText, { color: palette.accent }]}>EN VIVO</Text>
          </View>}
        </View>
        <LiveSignalChart waiting={connected || busy} accent={palette.accent} />
        {!connected && <Text style={styles.emptyCopy}>La variación aparecerá aquí cuando el sensor empiece a enviar datos.</Text>}
      </View>

      {state.error && <Pressable accessibilityRole="alert" onPress={plantSession.clearError} style={styles.error}>
        <Text style={styles.errorText}>{state.error}</Text><Icon name="close" size={15} color={colors.amber} />
      </Pressable>}

      <View style={styles.bottom}>
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
          <Pressable accessibilityRole="button" accessibilityLabel={state.playing ? "Silenciar música" : "Reanudar música"}
            accessibilityState={{ disabled: !connected }} disabled={!connected}
            onPress={plantSession.togglePlayback} style={[styles.roundButton, !connected && styles.disabled]}>
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
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  page: { flex: 1, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 10 },
  header: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  wordmark: { color: colors.ink, fontSize: 11, letterSpacing: 3.2, fontWeight: "500" },
  bluetooth: { maxWidth: 178, minHeight: 42, paddingHorizontal: 13, borderRadius: 22, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(248,245,238,.74)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(31,40,24,.18)" },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  bluetoothText: { color: colors.ink, fontSize: 11, flexShrink: 1 },
  signalArea: { flex: 1, minHeight: 275, justifyContent: "center", paddingTop: 18 },
  signalHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28 },
  kicker: { color: colors.muted, fontSize: 9, letterSpacing: 1.8, marginBottom: 7 },
  signalTitle: { color: colors.ink, fontSize: 25, letterSpacing: -.5 },
  livePill: { flexDirection: "row", gap: 6, alignItems: "center", borderWidth: 1, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 6 },
  liveDot: { width: 5, height: 5, borderRadius: 3 },
  liveText: { fontSize: 8, letterSpacing: 1.2, fontWeight: "600" },
  emptyCopy: { color: colors.muted, fontSize: 11, lineHeight: 17, maxWidth: 250, marginTop: 18 },
  error: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.amber, paddingVertical: 10 },
  errorText: { color: colors.amber, fontSize: 11, lineHeight: 16, flex: 1 },
  bottom: { gap: 14 },
  actions: { flexDirection: "row", gap: 10 },
  roundButton: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(248,245,238,.76)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(31,40,24,.18)" },
  disabled: { opacity: .34 },
  moodCard: { minHeight: 128, borderRadius: 28, flexDirection: "row", alignItems: "center", overflow: "hidden", paddingHorizontal: 21, paddingVertical: 20 },
  moodCopy: { flex: 1, zIndex: 1 },
  moodKicker: { fontSize: 9, letterSpacing: 1.8, opacity: .72, marginBottom: 8 },
  moodName: { color: colors.paper, fontSize: 24, letterSpacing: -.4, marginBottom: 7 },
  moodDescription: { color: colors.paper, opacity: .68, fontSize: 11, lineHeight: 16, maxWidth: 230 },
  moodMark: { position: "absolute", right: 30, top: 12, opacity: .35 },
});
