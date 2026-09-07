import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import Slider from "@react-native-community/slider";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  INSTRUMENTS,
  SYNTHS,
  SCALES,
  NOTE_NAMES,
  TUNINGS,
  copyPatch,
  type Patch,
} from "@/lib/sonora/presets";
import { plantSession, usePlantSession } from "@/lib/plant-session";
import { colors, serif } from "./plantia-theme";
import { Icon } from "./plant-icon";

export function SoundSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit = "%",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <View style={styles.sliderBlock}>
      <View style={styles.between}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.number}>
          {Number(draft.toFixed(2))}
          {unit}
        </Text>
      </View>
      <Slider
        accessibilityLabel={label}
        style={styles.slider}
        value={value}
        minimumValue={min}
        maximumValue={max}
        step={step}
        onValueChange={setDraft}
        onSlidingComplete={onChange}
        minimumTrackTintColor={colors.green}
        maximumTrackTintColor={colors.line}
        thumbTintColor={colors.green}
      />
    </View>
  );
}
function Choices({
  options,
  selected,
  onSelect,
}: {
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.choices}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          accessibilityState={{ selected: option.value === selected }}
          onPress={() => onSelect(option.value)}
          style={[styles.chip, selected === option.value && styles.chipSelected]}
        >
          <Text style={[styles.chipText, selected === option.value && styles.chipTextSelected]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
const effectRows = [
  ["reverb", "Reverberación", "wet", "Presencia", "amount", "Espacio"],
  ["delay", "Eco", "wet", "Presencia", "rate", "Tiempo"],
  ["chorus", "Chorus", "depth", "Profundidad", "rate", "Velocidad"],
  ["envelope", "Envolvente", "attack", "Ataque", "release", "Liberación"],
] as const;

export function SoundEditor({
  lane,
  onClose,
}: {
  lane: "synth" | "instrument" | "mix" | null;
  onClose: () => void;
}) {
  const { config, playing, connection } = usePlantSession();
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => setAdvanced(false), [lane]);
  const patch = lane === "synth" ? config.synth : config.instrument;
  const updatePatch = (next: Patch) => {
    if (lane && lane !== "mix") plantSession.configure({ ...config, [lane]: next });
  };
  const presets = lane === "synth" ? SYNTHS : INSTRUMENTS;
  const title =
    lane === "mix" ? "A tu ritmo." : lane === "synth" ? "Una atmósfera." : "Un timbre natural.";
  return (
    <Modal
      visible={lane !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
        <View style={styles.modalHeader}>
          <Text style={styles.eyebrow}>
            {lane === "mix" ? "LA ESCUCHA" : lane === "synth" ? "SYNTH" : "INSTRUMENTO"}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar ajustes"
            onPress={onClose}
            style={styles.close}
          >
            <Icon name="close" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>
            {lane === "mix"
              ? "Encuentra el equilibrio de tu pequeño jardín sonoro."
              : "Elige un sonido y deja que tu planta lo transforme."}
          </Text>
          {lane === "mix" ? (
            <>
              <SoundSlider
                label="Ritmo"
                min={0.25}
                max={2}
                step={0.05}
                unit="×"
                value={config.speed}
                onChange={(speed) => plantSession.configure({ ...config, speed })}
              />
              <SoundSlider
                label="Volumen del synth"
                value={config.synthLevel * 100}
                onChange={(v) => plantSession.configure({ ...config, synthLevel: v / 100 })}
              />
              <SoundSlider
                label="Volumen del instrumento"
                value={config.instrumentLevel * 100}
                onChange={(v) => plantSession.configure({ ...config, instrumentLevel: v / 100 })}
              />
              <SoundSlider
                label="Saludo de la planta"
                min={20}
                value={config.greetingLevel * 100}
                onChange={(v) => plantSession.configure({ ...config, greetingLevel: v / 100 })}
              />
            </>
          ) : (
            <>
              <Choices
                options={presets.map((p) => ({ value: p.id, label: p.name }))}
                selected={patch.preset}
                onSelect={(id) => updatePatch(copyPatch(id))}
              />
              <Pressable
                accessibilityRole="button"
                disabled={!playing || connection !== "connected"}
                onPress={() => lane && plantSession.preview(lane)}
                style={[styles.preview, !playing && { opacity: 0.4 }]}
              >
                <Icon name="play" size={17} />
                <Text style={styles.previewText}>Escuchar este sonido</Text>
              </Pressable>
              <Text style={styles.section}>CARÁCTER</Text>
              <Text style={styles.label}>Escala</Text>
              <Choices
                options={[...Object.keys(SCALES), "Custom"].map((value) => ({
                  value,
                  label: value === "Custom" ? "Personalizada" : value,
                }))}
                selected={patch.scale}
                onSelect={(scale) =>
                  updatePatch({ ...patch, scale, notes: [...(SCALES[scale] ?? patch.notes)] })
                }
              />
              <Text style={styles.label}>Afinación</Text>
              <Choices
                options={TUNINGS.map((value) => ({ value: String(value), label: `${value} Hz` }))}
                selected={String(patch.tuning)}
                onSelect={(tuning) => updatePatch({ ...patch, tuning: Number(tuning) })}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: advanced }}
                onPress={() => setAdvanced(!advanced)}
                style={styles.advanced}
              >
                <Text style={styles.previewText}>Afinar los detalles</Text>
                <Text style={styles.previewText}>{advanced ? "−" : "+"}</Text>
              </Pressable>
              {advanced && (
                <>
                  <Text style={styles.label}>Notas</Text>
                  <View style={styles.choices}>
                    {NOTE_NAMES.map((name, i) => (
                      <Pressable
                        key={name}
                        accessibilityRole="button"
                        accessibilityState={{ selected: patch.notes.includes(i) }}
                        style={[styles.chip, patch.notes.includes(i) && styles.chipSelected]}
                        onPress={() => {
                          if (patch.notes.length === 1 && patch.notes[0] === i) return;
                          updatePatch({
                            ...patch,
                            scale: "Custom",
                            notes: patch.notes.includes(i)
                              ? patch.notes.filter((n) => n !== i)
                              : [...patch.notes, i].sort((a, b) => a - b),
                          });
                        }}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            patch.notes.includes(i) && styles.chipTextSelected,
                          ]}
                        >
                          {name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <SoundSlider
                    label="Octava mínima"
                    min={1}
                    max={6}
                    unit=""
                    value={patch.octaves[0]}
                    onChange={(v) =>
                      updatePatch({ ...patch, octaves: [v, Math.max(v, patch.octaves[1])] })
                    }
                  />
                  <SoundSlider
                    label="Octava máxima"
                    min={1}
                    max={6}
                    unit=""
                    value={patch.octaves[1]}
                    onChange={(v) =>
                      updatePatch({ ...patch, octaves: [Math.min(v, patch.octaves[0]), v] })
                    }
                  />
                  <SoundSlider
                    label="Intensidad"
                    max={127}
                    unit=""
                    value={patch.velocity.center}
                    onChange={(center) =>
                      updatePatch({ ...patch, velocity: { ...patch.velocity, center } })
                    }
                  />
                  <SoundSlider
                    label="Variación de intensidad"
                    max={127}
                    unit=""
                    value={patch.velocity.range}
                    onChange={(range) =>
                      updatePatch({ ...patch, velocity: { ...patch.velocity, range } })
                    }
                  />
                </>
              )}
              <Text style={styles.section}>TEXTURAS</Text>
              {effectRows.map(([key, label, first, firstLabel, second, secondLabel]) => {
                const effect = patch[key] as { on: boolean } & Record<string, number | boolean>;
                const set = (change: Record<string, number | boolean>) =>
                  updatePatch({ ...patch, [key]: { ...effect, ...change } } as Patch);
                return (
                  <View key={key} style={styles.effect}>
                    <View style={styles.between}>
                      <Text style={styles.effectTitle}>{label}</Text>
                      <Switch
                        accessibilityLabel={label}
                        value={effect.on}
                        onValueChange={(on) => set({ on })}
                        trackColor={{ false: colors.line, true: colors.green }}
                      />
                    </View>
                    {effect.on && (
                      <>
                        <SoundSlider
                          label={firstLabel}
                          value={Number(effect[first])}
                          onChange={(v) => set({ [first]: v })}
                        />
                        <SoundSlider
                          label={secondLabel}
                          value={Number(effect[second])}
                          onChange={(v) => set({ [second]: v })}
                        />
                      </>
                    )}
                  </View>
                );
              })}
              <Pressable
                accessibilityRole="button"
                onPress={() => updatePatch(copyPatch(patch.preset))}
                style={styles.reset}
              >
                <Text style={styles.description}>Restablecer este sonido</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    paddingHorizontal: 25,
    paddingTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eyebrow: { fontSize: 10, letterSpacing: 2, color: colors.muted, fontWeight: "600" },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.soft,
  },
  content: {
    padding: 25,
    paddingTop: 10,
    paddingBottom: 45,
    gap: 18,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },
  title: { fontFamily: serif, fontSize: 33, color: colors.ink },
  description: { fontSize: 13, lineHeight: 21, color: colors.muted },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  sliderBlock: { gap: 5 },
  label: { fontSize: 13, color: colors.ink },
  number: { fontSize: 12, color: colors.muted, fontVariant: ["tabular-nums"] },
  slider: { height: 35, marginHorizontal: -2 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipSelected: { backgroundColor: colors.green, borderColor: colors.green },
  chipText: { fontSize: 12, color: colors.ink },
  chipTextSelected: { color: colors.paper },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: 15,
    backgroundColor: colors.sage,
    borderRadius: 18,
  },
  previewText: { fontSize: 13, fontWeight: "500", color: colors.ink },
  section: { color: colors.muted, letterSpacing: 2, fontSize: 10, marginTop: 14 },
  advanced: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 17,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  effect: { padding: 18, backgroundColor: colors.paper, borderRadius: 22, gap: 12 },
  effectTitle: { fontSize: 16, color: colors.ink, fontFamily: serif },
  reset: { alignItems: "center", padding: 12 },
});
