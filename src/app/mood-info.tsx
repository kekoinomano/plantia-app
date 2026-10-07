import { useState } from "react";
import { useTranslation } from '@/lib/i18n';
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/screen-header";
import { Icon } from "@/components/plant-icon";
import { WaveMusicInspector } from "@/components/wave-music-inspector";
import { colors, moodPalette } from "@/components/saviasound-theme";
import { usePlantControls } from "@/lib/plant-session";
import { preset } from "@/lib/sonora/presets";
import { waveMood } from "@/lib/wave-music/registry";
import { moodName, moodDescription, moodExplanation } from '@/lib/mood-copy';

export default function MoodInfoScreen() {
  const { language, t } = useTranslation();
  const names = (ids: readonly string[]) => [...new Set(ids.map(id => t(preset(id).name)))].join(" · ");
  const state = usePlantControls();
  const mood = waveMood(state.config.profile)!;
  const palette = moodPalette(mood.profile.id);
  const [paused, setPaused] = useState(false);
  const connected = state.connection === "connected";
  const sections = [
    { title: "Identidad musical", value: moodDescription(mood.profile.id, mood.profile.description, language) },
    { title: "Pulso y forma", value: `${mood.ensemble.tempo[0]}–${mood.ensemble.tempo[1]} BPM · ${t('compás de')} ${mood.ensemble.meter} ${t('tiempos. El tempo se mueve dentro de ese margen, sin perseguir cada cambio de la señal.')}` },
    { title: "Voz principal", value: names(mood.profile.lead) },
    { title: "Acompañamiento principal", value: names(mood.profile.body) },
    { title: "Campo armónico", value: `${t(state.config.scale)} · ${t('La4 a')} ${state.config.tuning} ${t('Hz. El centro tonal lo decide la señal; la escala elegida define sus grados disponibles.')}` },
    { title: "Apariciones posibles", value: `${names(mood.profile.detail)}${mood.ensemble.texture.length ? ` · ${names(mood.ensemble.texture)}` : ""}. ${t('Entran solo cuando la forma musical deja espacio.')}` },
    { title: "Saludo", value: "Un pico excepcional activa un golpe de bell tree. La toma varía suavemente con el tempo actual en todos los moods." },
    ...(mood.profile.id === "ghibli" ? [{ title: "Piano grabado", value: "Salamander Grand Piano V3, grabaciones de Alexander Holm · licencia CC BY 3.0." }] : []),
  ];
  return <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
    <ScreenHeader title={t('Cómo escucha')} />
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={[styles.hero, { backgroundColor: palette.deep }]}>
        <Text style={[styles.kicker, { color: palette.wash }]}>{t('MOOD EN ESCUCHA')}</Text>
        <Text style={styles.title}>{moodName(mood.profile.id, mood.profile.name, language)}</Text>
        <Text style={styles.heroCopy}>{t('La señal no “compone” una canción: modifica decisiones acotadas dentro de este lenguaje musical.')}</Text>
      </View>

      <View style={styles.staticBlock}>
        <Text style={styles.blockKicker}>{t('PARTITURA DEL MOOD')}</Text>
        {sections.map((section, index) => <View key={section.title} style={styles.sectionRow}>
          <Text style={[styles.index, { color: palette.accent }]}>{String(index + 1).padStart(2, "0")}</Text>
          <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>{t(section.title)}</Text><Text style={styles.sectionCopy}>{t(section.value)}</Text></View>
        </View>)}
      </View>

      <View style={styles.influence}>
        <Text style={styles.blockKicker}>{t('QUÉ PUEDE CAMBIAR LA PLANTA')}</Text>
        {mood.explanation.map((line, index) => <View key={`${index}:${line}`} style={styles.bulletRow}>
          <View style={[styles.bullet, { backgroundColor: palette.accent }]} /><Text style={styles.influenceText}>{moodExplanation(mood.profile.id, index, line, language)}</Text>
        </View>)}
      </View>

      <View style={styles.liveHeading}>
        <View style={{ flex: 1 }}><Text style={styles.blockKicker}>{t('TRANSFORMADAS EN VIVO')}</Text><Text style={styles.liveIntro}>{t('Ventanas, ondas, peso en el ajuste y decisiones que llegan al motor musical.')}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={t(paused ? "Reanudar información" : "Pausar información")}
          onPress={() => setPaused(value => !value)} style={[styles.pause, paused && { backgroundColor: palette.deep }]}>
          <Icon name={paused ? "play" : "pause"} size={17} color={paused ? colors.paper : colors.ink} />
        </Pressable>
      </View>
      {paused && <Text style={[styles.paused, { color: palette.accent }]}>{t('LECTURA PAUSADA · EL AUDIO SIGUE SU CURSO')}</Text>}
      <WaveMusicInspector connected={connected} playing={state.playing} paused={paused} />
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 44, gap: 34 },
  hero: { borderRadius: 28, padding: 24, minHeight: 190, justifyContent: "flex-end" }, kicker: { fontSize: 8, letterSpacing: 1.8, opacity: .7, marginBottom: 12 }, title: { color: colors.paper, fontSize: 34, letterSpacing: -1, marginBottom: 12 }, heroCopy: { color: colors.paper, opacity: .67, fontSize: 12, lineHeight: 18, maxWidth: 310 },
  blockKicker: { color: colors.muted, fontSize: 9, letterSpacing: 1.7, marginBottom: 8 }, staticBlock: { gap: 0 }, sectionRow: { flexDirection: "row", gap: 16, paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }, index: { fontSize: 10, letterSpacing: 1 }, sectionTitle: { color: colors.ink, fontSize: 15, marginBottom: 7 }, sectionCopy: { color: colors.muted, fontSize: 11, lineHeight: 18 },
  influence: { backgroundColor: colors.soft, borderRadius: 24, padding: 20, gap: 14 }, bulletRow: { flexDirection: "row", gap: 11, alignItems: "flex-start" }, bullet: { width: 5, height: 5, borderRadius: 3, marginTop: 7 }, influenceText: { flex: 1, color: colors.ink, fontSize: 11, lineHeight: 18 },
  liveHeading: { flexDirection: "row", alignItems: "center", gap: 16 }, liveIntro: { color: colors.muted, fontSize: 11, lineHeight: 17, maxWidth: 280 }, pause: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.soft, alignItems: "center", justifyContent: "center" }, paused: { fontSize: 8, letterSpacing: 1.4, marginTop: -20 },
});
