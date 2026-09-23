import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/screen-header";
import { Icon } from "@/components/plant-icon";
import { WaveMark } from "@/components/muromura-visuals";
import { colors, moodPalette } from "@/components/plantia-theme";
import { plantSession, usePlantControls } from "@/lib/plant-session";
import { PROFILES } from "@/lib/sonora/focus";

export default function MoodsScreen() {
  const router = useRouter();
  const state = usePlantControls();
  return <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
    <ScreenHeader title="Moods" />
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.intro}>Cada mood escucha la misma señal, pero organiza el tiempo, las voces y el espacio de una forma distinta.</Text>
      {PROFILES.map(mood => {
        const palette = moodPalette(mood.id), selected = mood.id === state.config.profile;
        return <Pressable key={mood.id} accessibilityRole="button" accessibilityState={{ selected }}
          onPress={() => { plantSession.selectProfile(mood.id); router.back(); }}
          style={[styles.card, { backgroundColor: palette.deep }]}>
          <View style={{ flex: 1, zIndex: 1 }}>
            <Text style={[styles.label, { color: palette.wash }]}>{selected ? "EN ESCUCHA" : "MOOD"}</Text>
            <Text style={styles.name}>{mood.name}</Text>
            <Text style={styles.description}>{mood.description}</Text>
          </View>
          <View style={styles.mark}><WaveMark color={palette.accent} width={110} /></View>
          {selected ? <Icon name="check" color={palette.wash} /> : <Icon name="chevron" color={palette.wash} />}
        </Pressable>;
      })}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { padding: 22, paddingTop: 12, paddingBottom: 30, gap: 14 },
  intro: { color: colors.muted, fontSize: 13, lineHeight: 20, marginBottom: 8, maxWidth: 330 },
  card: { minHeight: 148, borderRadius: 28, padding: 21, flexDirection: "row", alignItems: "center", overflow: "hidden" },
  label: { fontSize: 8, letterSpacing: 1.8, opacity: .7, marginBottom: 10 }, name: { color: colors.paper, fontSize: 25, marginBottom: 8 },
  description: { color: colors.paper, opacity: .65, fontSize: 11, lineHeight: 16, maxWidth: 270 }, mark: { position: "absolute", right: 24, top: 15, opacity: .32 },
});
