import { useEffect, useRef } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/screen-header";
import { Icon } from "@/components/plant-icon";
import { colors } from "@/components/plantia-theme";
import { plantSession, usePlantControls } from "@/lib/plant-session";

const shortId = (id: string) => {
  const hex = id.replace(/[^0-9a-f]/gi, "");
  return hex.length >= 4 ? hex.slice(-4).toUpperCase() : null;
};

export default function BluetoothScreen() {
  const state = usePlantControls();
  const attempted = useRef(false);
  const connected = state.connection === "connected";
  const connectedDevice = state.rememberedDevices.find(device => device.name === state.device);
  const busy = state.connection === "scanning" || state.connection === "connecting" || state.connection === "disconnecting";
  useEffect(() => {
    if (attempted.current) return;
    const timer = setTimeout(() => {
      attempted.current = true;
      if (plantSession.getControls().connection === "idle" && !plantSession.getControls().rememberedDevices.length)
        void plantSession.connect();
    }, 350);
    return () => clearTimeout(timer);
  }, []);

  return <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
    <ScreenHeader title="Conexión" />
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.intro}>
        <Text style={styles.kicker}>BLUETOOTH</Text>
        <Text style={styles.title}>{connected ? "La planta está cerca." : "Encuentra tu planta."}</Text>
        <Text style={styles.copy}>Guardamos en este teléfono los sensores conectados para que la próxima vez solo tengas que tocarlos.</Text>
      </View>

      {connected && <View style={styles.connectedCard}>
        <View style={styles.deviceIcon}><Icon name="wave" size={24} color={colors.paper} /></View>
        <View style={{ flex: 1 }}><Text style={styles.deviceName}>{state.device}</Text><Text style={styles.connectedLabel}>CONECTADA · RECIBIENDO SEÑAL{connectedDevice && shortId(connectedDevice.id) ? ` · ID ${shortId(connectedDevice.id)}` : ""}</Text></View>
        <View style={styles.greenDot} />
      </View>}

      {state.rememberedDevices.length > 0 && <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tus plantas</Text>
        {state.rememberedDevices.map(device => <View key={device.id} style={styles.deviceRow}>
          <Pressable disabled={busy || connected} accessibilityRole="button" accessibilityLabel={`Conectar con ${device.name}${shortId(device.id) ? `, ID ${shortId(device.id)}` : ""}`}
            onPress={() => void plantSession.connectRemembered(device.id)} style={styles.deviceConnect}>
            <View style={styles.deviceIcon}><Icon name="wave" size={21} color={colors.paper} /></View>
            <View style={{ flex: 1 }}><Text style={styles.deviceName}>{device.name}</Text><Text style={styles.meta}>{connected && connectedDevice?.id === device.id ? "CONECTADA" : "CONEXIÓN RÁPIDA"}{shortId(device.id) ? ` · ID ${shortId(device.id)}` : ""}</Text></View>
            {state.connection === "connecting" && state.device === device.name
              ? <ActivityIndicator color={colors.green} /> : <Icon name="chevron" size={17} color={colors.muted} />}
          </Pressable>
          <Pressable disabled={state.connection === "connecting" || state.connection === "disconnecting"}
            accessibilityRole="button" accessibilityLabel={`Eliminar ${device.name} de los dispositivos guardados`}
            onPress={() => plantSession.forgetDevice(device.id)} style={styles.removeDevice}>
            <Icon name="close" size={17} color={colors.muted} />
          </Pressable>
        </View>)}
      </View>}

      {(state.connection === "scanning" || state.devices.length > 0) && <View style={styles.section}>
        <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Cerca de ti</Text><ActivityIndicator color={colors.green} /></View>
        {!state.devices.length && <Text style={styles.searching}>Buscando sensores saviasound…</Text>}
        {state.devices.map(device => <Pressable key={device.id} accessibilityRole="button"
          onPress={() => plantSession.selectDevice(device.id)} style={styles.deviceRow}>
          <View style={styles.deviceIcon}><Icon name="bluetooth" size={20} color={colors.paper} /></View>
          <View style={{ flex: 1 }}><Text style={styles.deviceName}>{device.name}</Text><Text style={styles.meta}>NUEVA PLANTA{shortId(device.id) ? ` · ID ${shortId(device.id)}` : ""}</Text></View>
          <Icon name="chevron" size={17} color={colors.muted} />
        </Pressable>)}
      </View>}

      {state.error && <Pressable onPress={plantSession.clearError} style={styles.error}>
        <Text style={styles.errorText}>{state.error}</Text><Icon name="close" size={17} color={colors.amber} />
      </Pressable>}
      <View style={{ flex: 1 }} />
      <Pressable accessibilityRole="button" disabled={state.connection === "connecting" || state.connection === "disconnecting"}
        onPress={() => connected || state.connection === "scanning" ? void plantSession.disconnect() : void plantSession.connect()}
        style={[styles.primary, busy && state.connection !== "scanning" && styles.disabled]}>
        {busy && state.connection !== "scanning" ? <ActivityIndicator color={colors.paper} /> : <Icon name={connected ? "close" : "search"} size={19} color={colors.paper} />}
        <Text style={styles.primaryText}>{connected ? "Desconectar" : state.connection === "scanning" ? "Cancelar búsqueda" : "Buscar otra planta"}</Text>
      </Pressable>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { flexGrow: 1, paddingHorizontal: 22, paddingBottom: 18, gap: 24 },
  intro: { paddingTop: 24, paddingBottom: 8 }, kicker: { fontSize: 9, letterSpacing: 2, color: colors.muted, marginBottom: 14 },
  title: { fontSize: 34, letterSpacing: -1, color: colors.ink, marginBottom: 14 }, copy: { fontSize: 13, lineHeight: 20, color: colors.muted, maxWidth: 320 },
  section: { gap: 8 }, sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, sectionTitle: { fontSize: 13, color: colors.ink, marginBottom: 5 },
  searching: { fontSize: 12, color: colors.muted, paddingVertical: 18 }, deviceRow: { minHeight: 78, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, flexDirection: "row", alignItems: "center", gap: 14 },
  deviceConnect: { flex: 1, minHeight: 78, flexDirection: "row", alignItems: "center", gap: 14 }, removeDevice: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  connectedCard: { minHeight: 94, paddingHorizontal: 16, borderRadius: 22, backgroundColor: colors.paper, flexDirection: "row", alignItems: "center", gap: 14 },
  deviceIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center" },
  deviceName: { fontSize: 16, color: colors.ink }, meta: { fontSize: 8, color: colors.muted, letterSpacing: 1.3, marginTop: 6 }, connectedLabel: { fontSize: 8, color: colors.green, letterSpacing: 1.2, marginTop: 6 }, greenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  error: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.amber, borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }, errorText: { flex: 1, fontSize: 11, lineHeight: 17, color: colors.amber },
  primary: { minHeight: 56, borderRadius: 28, backgroundColor: colors.forest, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" }, primaryText: { color: colors.paper, fontSize: 13 }, disabled: { opacity: .45 },
});
