import { useState } from "react";
import { useTranslation } from '@/lib/i18n';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/screen-header";
import { Icon } from "@/components/plant-icon";
import { colors, moodPalette } from "@/components/saviasound-theme";
import { plantSession, usePlantControls } from "@/lib/plant-session";
import { profile } from "@/lib/sonora/focus";
import { SCALES, TUNINGS } from "@/lib/sonora/presets";
import { moodName } from '@/lib/mood-copy';

const SCALE_NAMES: Record<string, string> = {
  Ionian: "Jónica", Doric: "Dórica", Phrygian: "Frigia", Lydian: "Lidia",
  Mixolydian: "Mixolidia", Aeolian: "Eólica", Locrio: "Locria",
  "Maj Pentatonic": "Pentatónica mayor", "Min Pentatonic": "Pentatónica menor",
  wholetone: "Tonos enteros",
};
export default function MoodEditScreen() {
  const { language, t } = useTranslation();
  const scaleName = (scale: string) => t(SCALE_NAMES[scale] ?? scale);
  const state = usePlantControls();
  const mood = profile(state.config.profile);
  const palette = moodPalette(mood.id);
  const [scalesOpen, setScalesOpen] = useState(false);
  const update = (patch: Partial<typeof state.config>) =>
    plantSession.configure({ ...state.config, ...patch });

  return <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
    <ScreenHeader title={t('Editar mood')} />
    <View style={styles.content}>
      <Text style={styles.mood}>{moodName(mood.id, mood.name, language).toUpperCase()}</Text>

      <View style={styles.setting}>
        <Text style={styles.label}>{t('Frecuencia')}</Text>
        <View style={styles.frequencyRow}>
          {TUNINGS.map(tuning => {
            const selected = state.config.tuning === tuning;
            return <Pressable key={tuning} accessibilityRole="button"
              accessibilityState={{ selected }} onPress={() => update({ tuning })}
              style={[styles.frequency, selected && { backgroundColor: palette.deep }]}>
              <Text style={[styles.frequencyText, selected && styles.selectedText]}>{tuning} Hz</Text>
            </Pressable>;
          })}
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.setting}>
        <Text style={styles.label}>{t('Escala')}</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: scalesOpen }}
          onPress={() => setScalesOpen(true)} style={styles.select}>
          <Text style={styles.selectText}>{scaleName(state.config.scale)}</Text>
          <Icon name="chevron" size={16} color={colors.muted} />
        </Pressable>
      </View>
    </View>

    <Modal transparent animationType="fade" visible={scalesOpen}
      onRequestClose={() => setScalesOpen(false)}>
      <Pressable style={styles.backdrop} onPress={() => setScalesOpen(false)}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{t('Escala')}</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {Object.keys(SCALES).map(scale => {
              const selected = state.config.scale === scale;
              return <Pressable key={scale} accessibilityRole="button"
                accessibilityState={{ selected }} onPress={() => {
                  update({ scale });
                  setScalesOpen(false);
                }} style={styles.scaleRow}>
                <Text style={[styles.scaleText, selected && { color: palette.accent }]}>
                  {scaleName(scale)}
                </Text>
                {selected && <Icon name="check" size={17} color={palette.accent} />}
              </Pressable>;
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 24, paddingTop: 34 },
  mood: { color: colors.muted, fontSize: 8, letterSpacing: 1.8, marginBottom: 42 },
  setting: { gap: 12 },
  label: { color: colors.muted, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase" },
  frequencyRow: { flexDirection: "row", alignSelf: "flex-start", padding: 3, gap: 2, borderRadius: 18, backgroundColor: colors.soft },
  frequency: { minWidth: 70, minHeight: 34, paddingHorizontal: 12, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  frequencyText: { color: colors.ink, fontSize: 11, fontVariant: ["tabular-nums"] },
  selectedText: { color: colors.paper },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: 30 },
  select: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  selectText: { color: colors.ink, fontSize: 16 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(31,40,24,.2)" },
  sheet: { maxHeight: "72%", paddingHorizontal: 24, paddingTop: 10, paddingBottom: 28, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.paper },
  handle: { width: 34, height: 3, borderRadius: 2, backgroundColor: colors.line, alignSelf: "center", marginBottom: 18 },
  sheetTitle: { color: colors.ink, fontSize: 20, marginBottom: 12 },
  scaleRow: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  scaleText: { color: colors.ink, fontSize: 14 },
});
