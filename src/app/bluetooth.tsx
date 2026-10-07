import { useEffect, useRef } from "react";
import { useTranslation } from '@/lib/i18n';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/screen-header";
import { Icon } from "@/components/plant-icon";
import { colors } from "@/components/saviasound-theme";
import { plantSession, usePlantControls } from "@/lib/plant-session";

const shortId = (id: string) => {
  const hex = id.replace(/[^0-9a-f]/gi, "");
  return hex.length >= 4 ? hex.slice(-4).toUpperCase() : null;
};

export default function BluetoothScreen() {
  const { t } = useTranslation();
  const state = usePlantControls();
  const attempted = useRef(false);
  const connected = state.connection === "connected";
  const connecting = state.connection === "connecting";
  const disconnecting = state.connection === "disconnecting";
  const showingDevice = (connected || connecting || disconnecting) && !!state.device;
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
    <ScreenHeader title={t('Conexión')} />
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        {showingDevice ? <View style={styles.connectedCard}>
          <View style={[styles.greenDot, !connected && styles.pendingDot]} />
          <View style={styles.connectedCopy}>
            <Text numberOfLines={1} style={styles.deviceName}>{t(state.device)}</Text>
            <Text style={styles.connectedLabel}>{t(connected ? 'CONECTADO' : connecting ? 'Conectando…' : 'Desconectando…')}</Text>
          </View>
          {connected ? <Pressable accessibilityRole="button" accessibilityLabel={t('Desconectar')}
            onPress={() => void plantSession.disconnect()} style={styles.disconnect}>
            <Text style={styles.disconnectText}>{t('Desconectar')}</Text>
          </Pressable> : <ActivityIndicator color={colors.green} />}
        </View> : <View style={styles.intro}>
          <Text style={styles.title}>{t('Conecta tu saviasound.')}</Text>
          <Text style={styles.copy}>{t('Enciéndelo y selecciona uno guardado o busca uno nuevo.')}</Text>
        </View>}
      </View>

      {state.rememberedDevices.length > 0 && <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('Tus dispositivos')}</Text>
        {state.rememberedDevices.map(device => <View key={device.id} style={styles.deviceRow}>
          <Pressable disabled={busy || connected} accessibilityRole="button"
            accessibilityLabel={`${connected && state.device === device.name ? t('CONECTADO') : t('Conectar con')} ${t(device.name)}${shortId(device.id) ? `, ID ${shortId(device.id)}` : ''}`}
            onPress={() => void plantSession.connectRemembered(device.id)} style={styles.deviceConnect}>
            <View style={styles.deviceIcon}><Icon name="wave" size={21} color={colors.paper} /></View>
            <View style={styles.deviceNameFlexible}>
              <Text numberOfLines={1} style={styles.deviceName}>{t(device.name)}</Text>
              <Text style={styles.meta}>{t(connected && state.device === device.name ? 'CONECTADO' : 'CONEXIÓN RÁPIDA')}{shortId(device.id) ? ` · ID ${shortId(device.id)}` : ''}</Text>
            </View>
            {connecting && state.device === device.name ? <ActivityIndicator color={colors.green} />
              : connected && state.device === device.name ? <Icon name="check" size={17} color={colors.green} />
              : <Icon name="chevron" size={17} color={colors.muted} />}
          </Pressable>
          <Pressable disabled={connecting || disconnecting || connected && state.device === device.name}
            accessibilityRole="button" accessibilityLabel={`${t('Eliminar')} ${t(device.name)} ${t('de los dispositivos guardados')}`}
            onPress={() => plantSession.forgetDevice(device.id)} style={styles.removeDevice}>
            <Icon name="close" size={17} color={colors.muted} />
          </Pressable>
        </View>)}
      </View>}

      {(state.connection === "scanning" || state.devices.length > 0) && <View style={styles.section}>
        <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{t('Cerca de ti')}</Text>
          {state.connection === "scanning" && <ActivityIndicator color={colors.green} />}</View>
        {state.devices.map(device => <Pressable key={device.id} accessibilityRole="button"
          disabled={state.connection !== "scanning"}
          onPress={() => plantSession.selectDevice(device.id)} style={styles.deviceRow}>
          <View style={styles.deviceIcon}><Icon name="bluetooth" size={20} color={colors.paper} /></View>
          <View style={styles.deviceNameFlexible}>
            <Text numberOfLines={1} style={styles.deviceName}>{t(device.name)}</Text>
            <Text style={styles.meta}>{t('NUEVO DISPOSITIVO')}{shortId(device.id) ? ` · ID ${shortId(device.id)}` : ''}</Text>
          </View>
          {state.connection === "connecting" && state.device === device.name
            ? <ActivityIndicator color={colors.green} /> : <Icon name="chevron" size={17} color={colors.muted} />}
        </Pressable>)}
      </View>}

      {state.error && <Pressable onPress={plantSession.clearError} style={styles.error}>
        <Text style={styles.errorText}>{t(state.error)}</Text><Icon name="close" size={17} color={colors.amber} />
      </Pressable>}
      <View style={{ flex: 1 }} />
      <Pressable accessibilityRole="button"
        disabled={connected || connecting || disconnecting}
        onPress={() => state.connection === "scanning" ? void plantSession.disconnect() : void plantSession.connect()}
        style={[styles.primary, (connected || busy && state.connection !== "scanning") && styles.disabled]}>
        {busy && state.connection !== "scanning" ? <ActivityIndicator color={colors.paper} />
          : <Icon name={state.connection === "scanning" ? "close" : "search"} size={19} color={colors.paper} />}
        <Text style={styles.primaryText}>{t(state.connection === "connecting" ? "Conectando…" : state.connection === "scanning" ? "Cancelar búsqueda" : "Buscar dispositivos")}</Text>
      </Pressable>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 18, gap: 24 },
  hero: { minHeight: 94, justifyContent: "center" },
  intro: { minHeight: 94, justifyContent: "center" },
  title: { fontSize: 28, letterSpacing: -.7, color: colors.ink, marginBottom: 8 },
  copy: { fontSize: 12, lineHeight: 18, color: colors.muted },
  section: { gap: 8 }, sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, sectionTitle: { fontSize: 13, color: colors.ink, marginBottom: 5 },
  deviceRow: { minHeight: 78, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, flexDirection: "row", alignItems: "center", gap: 14 },
  deviceConnect: { flex: 1, minHeight: 78, flexDirection: "row", alignItems: "center", gap: 14 }, removeDevice: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  connectedCard: { minHeight: 82, paddingHorizontal: 16, borderRadius: 22, backgroundColor: colors.paper, flexDirection: "row", alignItems: "center", gap: 12 },
  connectedCopy: { flex: 1 }, disconnect: { minHeight: 44, paddingHorizontal: 10, justifyContent: "center" },
  disconnectText: { color: colors.muted, fontSize: 12 },
  deviceIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center" },
  deviceName: { fontSize: 16, color: colors.ink }, deviceNameFlexible: { flex: 1 },
  meta: { fontSize: 8, color: colors.muted, letterSpacing: 1.3, marginTop: 6 },
  connectedLabel: { fontSize: 9, color: colors.green, letterSpacing: 1.2, marginTop: 5 }, greenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  pendingDot: { backgroundColor: colors.muted },
  error: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.amber, borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }, errorText: { flex: 1, fontSize: 11, lineHeight: 17, color: colors.amber },
  primary: { minHeight: 56, borderRadius: 28, backgroundColor: colors.forest, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" }, primaryText: { color: colors.paper, fontSize: 13 }, disabled: { opacity: .45 },
});
