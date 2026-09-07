import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { plantSession, usePlantSession } from "@/lib/plant-session";
import { preset } from "@/lib/sonora/presets";
import { Botanical, Icon } from "@/components/plant-icon";
import { SignalChart } from "@/components/signal-chart";
import { SoundEditor } from "@/components/sound-editor";
import { colors, serif } from "@/components/plantia-theme";

export default function HomeScreen() {
  const state = usePlantSession();
  const [editor, setEditor] = useState<"synth" | "instrument" | "mix" | null>(null);
  const [credits, setCredits] = useState(false);
  const connected = state.connection === "connected";
  const scanning = state.connection === "scanning";
  const busy = scanning || state.connection === "connecting" || state.connection === "disconnecting";
  const signalLabel =
    state.signal === "live"
      ? "EN VIVO"
      : state.signal === "gap"
        ? "SIN SEÑAL"
        : connected
          ? "ESCUCHANDO"
          : "EN CALMA";
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <Icon name="leaf" size={24} />
            <Text style={styles.brandName}>plantia</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.smallDot} />
            <Text style={styles.headerNote}>un momento de naturaleza</Text>
          </View>
        </View>
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>LA NATURALEZA TIENE MÚSICA</Text>
            <Text style={styles.title}>Escucha lo{`\n`}que crece.</Text>
            <Text style={styles.subtitle}>
              Tu planta, convertida en sonido.{`\n`}Conecta. Respira. Quédate un rato.
            </Text>
          </View>
          <View style={styles.botanical} pointerEvents="none">
            <Botanical />
          </View>
        </View>
        <View style={styles.connectionRow}>
          <Pressable
            accessibilityRole="button"
            disabled={state.connection === "disconnecting"}
            onPress={() =>
              connected || busy ? void plantSession.disconnect() : void plantSession.connect()
            }
            style={({ pressed }) => [styles.connect, pressed && { opacity: 0.85 }]}
          >
            {busy ? (
              <ActivityIndicator color={colors.paper} size="small" />
            ) : (
              <Icon name={connected ? "leaf" : "bluetooth"} size={19} color={colors.paper} />
            )}
            <Text style={styles.connectText}>
              {scanning
                ? "Buscando plantas…"
                : state.connection === "connecting"
                  ? `Conectando con ${state.device}…`
                  : state.connection === "disconnecting"
                    ? "Desconectando…"
                    : connected
                      ? "Planta conectada"
                      : "Conectar planta"}
            </Text>
            {connected && <View style={styles.connectedDot} />}
          </Pressable>
          {connected && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={state.playing ? "Pausar música" : "Reanudar música"}
              onPress={plantSession.togglePlayback}
              style={styles.playButton}
            >
              <Icon name={state.playing ? "pause" : "play"} />
            </Pressable>
          )}
        </View>
        <Text style={styles.connectionHint}>
          {connected
            ? `${state.device} · toca para desconectar`
            : scanning
              ? state.devices.length > 0
                ? "Toca tu sensor de la lista · toca el botón para cancelar"
                : "Acerca tu sensor · toca el botón para cancelar"
              : state.connection === "connecting"
                ? "Un momento, estás muy cerca…"
                : "Acerca el sensor y deja que empiece la música."}
        </Text>
        {(scanning || state.connection === "connecting") && (
          <View style={styles.devices}>
            <View style={styles.devicesHeader}>
              <Text style={styles.devicesTitle}>
                {scanning ? "Sensores cerca de ti" : "Conectando…"}
              </Text>
              <Text style={styles.tiny}>
                {scanning
                  ? state.devices.length === 0
                    ? "BUSCANDO"
                    : `${state.devices.length} ENCONTRADOS`
                  : state.device.toUpperCase()}
              </Text>
            </View>
            {scanning && state.devices.length === 0 ? (
              <View style={styles.devicesEmpty}>
                <ActivityIndicator color={colors.green} />
                <Text style={styles.devicesEmptyText}>
                  Buscando sensores Bluetooth cercanos…
                </Text>
              </View>
            ) : (
              scanning && (
                <ScrollView style={styles.devicesList} nestedScrollEnabled>
                  {state.devices.map((device) => (
                    <Pressable
                      key={device.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Conectar con ${device.name}`}
                      onPress={() => plantSession.selectDevice(device.id)}
                      style={({ pressed }) => [styles.deviceRow, pressed && styles.deviceRowPressed]}
                    >
                      <Icon
                        name={device.plant ? "leaf" : "bluetooth"}
                        size={17}
                        color={device.plant ? colors.green : colors.muted}
                      />
                      <View style={styles.deviceInfo}>
                        <Text numberOfLines={1} style={styles.deviceName}>
                          {device.name}
                        </Text>
                        <Text style={styles.deviceMeta}>
                          {device.plant ? "sensor de planta" : "dispositivo"}
                          {device.rssi !== null ? ` · ${device.rssi} dBm` : ""}
                        </Text>
                      </View>
                      <Icon name="chevron" size={15} color={colors.muted} />
                    </Pressable>
                  ))}
                </ScrollView>
              )
            )}
          </View>
        )}
        {state.error && (
          <View style={styles.error}>
            <Text accessibilityRole="alert" style={styles.errorText}>
              {state.error}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar aviso"
              onPress={plantSession.clearError}
              hitSlop={12}
            >
              <Icon name="close" size={18} color={colors.amber} />
            </Pressable>
          </View>
        )}
        <View style={styles.signalCard}>
          <View style={styles.sectionRow}>
            <View>
              <Text style={styles.cardEyebrow}>EL PULSO DE TU PLANTA</Text>
              <View style={styles.valueRow}>
                <Text style={styles.signalValue}>
                  {state.lastValue === null
                    ? "—"
                    : Math.round(state.lastValue).toLocaleString("es-ES")}
                </Text>
                <Text style={styles.valueUnit}>señal del sensor</Text>
              </View>
            </View>
            <View style={styles.liveBadge}>
              <View
                style={[
                  styles.badgeDot,
                  state.signal === "live" && { backgroundColor: colors.green },
                ]}
              />
              <Text style={styles.badgeText}>{signalLabel}</Text>
            </View>
          </View>
          <SignalChart
            points={state.points}
            live={state.signal === "live"}
            waiting={connected || busy}
          />
        </View>
        <View style={styles.soundHeading}>
          <Text style={styles.sectionTitle}>Tu paisaje sonoro</Text>
          <Text style={styles.tiny}>DOS VOCES, UNA PLANTA</Text>
        </View>
        <View style={styles.soundCards}>
          {(["synth", "instrument"] as const).map((lane, i) => (
            <Pressable
              key={lane}
              accessibilityRole="button"
              accessibilityLabel={`Elegir ${lane === "synth" ? "synth" : "instrumento"} y modificar parámetros`}
              onPress={() => setEditor(lane)}
              style={({ pressed }) => [styles.soundCard, pressed && { opacity: 0.75 }]}
            >
              <LinearGradient
                colors={i === 0 ? ["#E8EDE0", "#F1F3EA"] : ["#F0EADB", "#F6F1E6"]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.cardTop}>
                <Text style={styles.cardEyebrow}>
                  {i === 0 ? "01 / SYNTH" : "02 / INSTRUMENTO"}
                </Text>
                <Icon
                  name={i === 0 ? "sound" : "leaf"}
                  size={18}
                  color={i === 0 ? "#78916F" : "#9B906B"}
                />
              </View>
              <Text numberOfLines={2} style={styles.soundName}>
                {preset(state.config[lane].preset).name}
              </Text>
              <Text style={styles.soundScale}>
                {state.config[lane].scale} · {state.config[lane].tuning} Hz
              </Text>
              <View style={styles.cardBottom}>
                <Text style={styles.editLabel}>Explorar sonido</Text>
                <Icon name="chevron" size={15} />
              </View>
            </Pressable>
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={() => setEditor("mix")} style={styles.mix}>
          <View style={styles.mixLeft}>
            <Icon name="sliders" size={20} />
            <Text style={styles.mixText}>Ritmo y mezcla</Text>
          </View>
          <Text style={styles.mixValue}>{Number(state.config.speed.toFixed(2))}×</Text>
          <Icon name="chevron" size={16} />
        </Pressable>
        <View style={styles.footer}>
          <View style={styles.footerLine} />
          <Icon name="leaf" size={16} color="#98A18F" />
          <View style={styles.footerLine} />
        </View>
        <Text style={styles.footerText}>
          {connected && state.playing
            ? "Puedes apagar la pantalla. La escucha continúa."
            : "Un pequeño espacio para bajar el ritmo."}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setCredits(!credits)}
          style={styles.creditsButton}
        >
          <Text style={styles.creditsLabel}>HECHO CON SONORA</Text>
        </Pressable>
        {credits && (
          <View style={styles.credits}>
            <Text style={styles.creditsText}>
              Muestras FluidR3 GM de Frank Wen y colaboradores. MIDI.js Soundfonts de Benjamin
              Gleitzman y colaboradores. Selección C2–C6, recortada y normalizada. Hang Drum utiliza
              steel drum; Koshi y Tibetan Bell son modelos de síntesis.
            </Text>
            <Pressable
              accessibilityRole="link"
              onPress={() =>
                void Linking.openURL(
                  "https://github.com/gleitz/midi-js-soundfonts/tree/gh-pages/FluidR3_GM",
                )
              }
            >
              <Text style={styles.creditLink}>Fuente de las muestras ↗</Text>
            </Pressable>
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL("https://creativecommons.org/licenses/by/3.0/")}
            >
              <Text style={styles.creditLink}>Licencia Creative Commons BY 3.0 ↗</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
      <SoundEditor lane={editor} onClose={() => setEditor(null)} />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 45,
    maxWidth: 620,
    width: "100%",
    alignSelf: "center",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandName: { fontFamily: serif, fontSize: 28, letterSpacing: -1, color: colors.ink },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  smallDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#8E9E7C" },
  headerNote: { color: colors.muted, fontSize: 9, flexShrink: 1 },
  hero: { marginTop: 34, minHeight: 208, justifyContent: "center" },
  heroCopy: { zIndex: 1 },
  eyebrow: { color: colors.muted, letterSpacing: 1.7, fontSize: 8, marginBottom: 16 },
  title: {
    fontFamily: serif,
    fontSize: 42,
    lineHeight: 47,
    color: colors.ink,
    letterSpacing: -1.4,
  },
  subtitle: { fontSize: 12, color: colors.muted, lineHeight: 20, marginTop: 17 },
  botanical: { position: "absolute", right: -19, top: 15, opacity: 0.9 },
  connectionRow: { flexDirection: "row", gap: 10, marginTop: 22 },
  connect: {
    flex: 1,
    minHeight: 56,
    borderRadius: 29,
    backgroundColor: colors.ink,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
  },
  connectText: { color: colors.paper, fontSize: 14, fontWeight: "500" },
  connectedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#BFD6A5" },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.sage,
    alignItems: "center",
    justifyContent: "center",
  },
  connectionHint: {
    color: colors.muted,
    fontSize: 10,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 16,
  },
  error: {
    backgroundColor: "#F3EBDC",
    padding: 15,
    borderRadius: 17,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginTop: 16,
  },
  errorText: { flex: 1, color: colors.amber, fontSize: 12, lineHeight: 19 },
  devices: {
    backgroundColor: colors.paper,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    marginTop: 14,
  },
  devicesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
  },
  devicesTitle: { fontFamily: serif, fontSize: 16, color: colors.ink },
  devicesEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 18,
  },
  devicesEmptyText: { color: colors.muted, fontSize: 11 },
  devicesList: { maxHeight: 240, marginTop: 6 },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  deviceRowPressed: { opacity: 0.7 },
  deviceInfo: { flex: 1, gap: 2 },
  deviceName: { color: colors.ink, fontSize: 13 },
  deviceMeta: { color: colors.muted, fontSize: 9 },
  signalCard: {
    backgroundColor: colors.paper,
    borderRadius: 26,
    padding: 20,
    marginTop: 26,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  cardEyebrow: { color: colors.muted, fontSize: 8, letterSpacing: 1.4 },
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: 7, marginTop: 8 },
  signalValue: {
    color: colors.ink,
    fontFamily: serif,
    fontSize: 26,
    fontVariant: ["tabular-nums"],
  },
  valueUnit: { color: colors.muted, fontSize: 9 },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: colors.soft,
    borderRadius: 20,
  },
  badgeDot: { width: 4, height: 4, backgroundColor: "#ACB5A2", borderRadius: 2 },
  badgeText: { color: colors.muted, fontSize: 7, letterSpacing: 0.9 },
  soundHeading: {
    marginTop: 29,
    marginBottom: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
  },
  sectionTitle: { fontFamily: serif, fontSize: 21, color: colors.ink },
  tiny: { color: colors.muted, fontSize: 7, letterSpacing: 0.6 },
  soundCards: { flexDirection: "row", gap: 12 },
  soundCard: { flex: 1, padding: 17, borderRadius: 23, overflow: "hidden", minHeight: 156 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  soundName: {
    fontFamily: serif,
    fontSize: 23,
    color: colors.ink,
    marginTop: 23,
    letterSpacing: -0.6,
  },
  soundScale: { color: colors.muted, fontSize: 9, marginTop: 7 },
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 22,
    gap: 4,
  },
  editLabel: { fontSize: 10, color: colors.ink },
  mix: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  mixLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 11 },
  mixText: { color: colors.ink, fontSize: 12 },
  mixValue: { color: colors.muted, fontSize: 12 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 13,
    marginTop: 27,
  },
  footerLine: { width: 25, height: 1, backgroundColor: colors.line },
  footerText: {
    textAlign: "center",
    fontFamily: serif,
    fontStyle: "italic",
    fontSize: 12,
    color: colors.muted,
    marginTop: 12,
    lineHeight: 20,
  },
  creditsButton: { alignSelf: "center", padding: 18 },
  creditsLabel: { color: "#9EA696", fontSize: 7, letterSpacing: 2 },
  credits: { gap: 10, padding: 15, backgroundColor: colors.soft, borderRadius: 16 },
  creditsText: { color: colors.muted, fontSize: 11, lineHeight: 18 },
  creditLink: { color: colors.green, fontSize: 11, textDecorationLine: "underline" },
});
