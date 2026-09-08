import { memo, useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, Keyboard } from "react-native";
import Slider from "@react-native-community/slider";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  INSTRUMENTS,
  SYNTHS,
  SCALES,
  NOTE_NAMES,
  TUNINGS,
  copyPatch,
  preset,
  type Patch,
} from "@/lib/sonora/presets";
import { plantSession, usePlantSessionValue } from "@/lib/plant-session";
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
  const [open, setOpen] = useState(false);
  return <View style={styles.selectContainer}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Cambiar ${options.find((o) => o.value === selected)?.label ?? selected}`} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.select}>
      <Text style={styles.label}>{options.find((o) => o.value === selected)?.label ?? selected}</Text>
      <View style={{ transform: [{ rotate: open ? "270deg" : "90deg" }] }}><Icon name="chevron" size={16} /></View>
    </Pressable>
    {open && <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={styles.optionList} nestedScrollEnabled keyboardShouldPersistTaps="handled">{options.map((option) => <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: option.value === selected }} onPress={() => { onSelect(option.value); setOpen(false); }} style={[styles.option, option.value === selected && styles.optionSelected]}>
      <Text style={styles.label}>{option.label}</Text>
      {option.value === selected && <Icon name="check" size={17} />}
    </Pressable>)}</ScrollView>}
  </View>;
}

export function soundIcon(id: string): "wave" | "keys" | "bell" | "strings" | "wind" {
  const sound = preset(id);
  if (sound.kind === "synth") return "wave";
  if (/bell|chime|bowl|drum|marimba|xylo/i.test(`${sound.name} ${sound.model} ${sound.program}`)) return "bell";
  if (/sitar|guitar|harp|string/i.test(`${sound.name} ${sound.program}`)) return "strings";
  if (/flute|wind|brass|oboe/i.test(`${sound.name} ${sound.program}`)) return "wind";
  return "keys";
}

const effectRows = [
  ["reverb", "Reverberación", "wet", "Presencia", "amount", "Espacio"],
  ["delay", "Eco", "wet", "Presencia", "rate", "Tiempo"],
  ["chorus", "Chorus", "depth", "Profundidad", "rate", "Velocidad"],
  ["envelope", "Envolvente", "attack", "Ataque", "release", "Liberación"],
] as const;

export const SoundEditor = memo(function SoundEditor({
  lane,
  onClose,
  initialMode = "choose",
}: {
  initialMode?: "choose" | "edit";
  lane: "synth" | "instrument" | "mix" | null;
  onClose: () => void;
}) {
  const config = usePlantSessionValue((state) => state.config);
  const playing = usePlantSessionValue((state) => state.playing);
  const connection = usePlantSessionValue((state) => state.connection);
  const [advanced, setAdvanced] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const [mode, setMode] = useState(initialMode);
  const [query, setQuery] = useState("");
  const [expandedEffect, setExpandedEffect] = useState<string | null>(null);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); Keyboard.dismiss(); }, [mode, lane]);
  useEffect(() => { setAdvanced(false); setMode(initialMode); setQuery(""); setExpandedEffect(null); }, [lane, initialMode]);
  const patch = lane === "synth" ? config.synth : config.instrument;
  const updatePatch = (next: Patch) => {
    if (lane && lane !== "mix") plantSession.configure({ ...config, [lane]: next });
  };
  const presets = lane === "synth" ? SYNTHS : INSTRUMENTS;
  const title =
    lane === "mix" ? "Ritmo y mezcla" : mode === "edit" ? preset(patch.preset).name : lane === "synth" ? "Elige tu atmósfera" : "Elige tu instrumento";
  return (
    <Modal
      visible={lane !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
        <View style={styles.modalHeader}>
          {mode === "edit" && lane !== "mix" ? <Pressable accessibilityRole="button" accessibilityLabel="Volver a los sonidos" onPress={() => setMode("choose")} style={styles.back}><View style={{ transform: [{ rotate: "180deg" }] }}><Icon name="chevron" size={17} /></View><Text style={styles.label}>Sonidos</Text></Pressable> : <Text style={styles.eyebrow}>
            {lane === "mix" ? "LA ESCUCHA" : lane === "synth" ? "SYNTH" : "INSTRUMENTO"}
          </Text>}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar ajustes"
            onPress={onClose}
            style={styles.close}
          >
            <Icon name="close" />
          </Pressable>
        </View>
        <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>
            {lane === "mix"
              ? "Encuentra el equilibrio de tu pequeño jardín sonoro."
              : mode === "edit" ? "Dale tu toque. Los cambios se aplican al momento." : "Una voz para tu planta. Toca para elegir, edita para hacerla tuya."}
          </Text>
          {lane !== "mix" && mode === "choose" ? (
            <>
              <View style={styles.search}><Icon name="search" size={19} color={colors.muted} /><TextInput accessibilityLabel="Buscar sonidos" placeholder="Buscar un sonido…" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} autoCorrect={false} style={styles.searchInput} /></View>
              <Text style={styles.eyebrow}>{presets.length} SONIDOS · EXPLORA A TU RITMO</Text>
              <View style={styles.library}>
                {presets.filter((p) => p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map((p) => {
                  const selected = p.id === patch.preset;
                  return <View key={p.id} style={[styles.soundRow, selected && styles.selectedRow]}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Elegir ${p.name}`} accessibilityState={{ selected }} onPress={() => { if (lane) plantSession.selectPreset(lane, p.id); onClose(); }} style={styles.soundChoice}>
                      <View style={[styles.soundIcon, selected && styles.selectedIcon]}><Icon name={soundIcon(p.id)} color={selected ? colors.paper : colors.green} size={25} /></View>
                      <View style={styles.soundCopy}><Text style={styles.soundTitle}>{p.name}</Text><Text style={styles.soundDetail}>{selected ? "Sonido actual" : p.description ?? (p.kind === "synth" ? "Atmósfera sintética" : "Instrumento melódico")}</Text></View>
                      {selected && <Icon name="check" size={18} color={colors.green} />}
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Editar ${p.name}`} onPress={() => { if (lane) plantSession.selectPreset(lane, p.id); setMode("edit"); }} style={styles.editButton}><Icon name="edit" size={18} /></Pressable>
                  </View>;
                })}
                {!presets.some((p) => p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) && <Text style={styles.description}>No hay sonidos con ese nombre.</Text>}
              </View>
            </>
          ) : lane === "mix" ? (
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
              <Pressable
                accessibilityRole="button"
                disabled={!playing || connection !== "connected"}
                onPress={() => lane && plantSession.preview(lane)}
                style={[styles.preview, (!playing || connection !== "connected") && { opacity: 0.4 }]}
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
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: advanced }} onPress={() => setAdvanced(!advanced)} style={styles.advanced}>
                <View><Text style={styles.previewText}>Notas y afinación</Text><Text style={styles.soundDetail}>Registro, intensidad y afinación precisa</Text></View>
                <Text style={styles.previewText}>{advanced ? "−" : "+"}</Text>
              </Pressable>
              {advanced && (<>
              <Text style={styles.label}>Afinación</Text>
              <Choices
                options={TUNINGS.map((value) => ({ value: String(value), label: `${value} Hz` }))}
                selected={String(patch.tuning)}
                onSelect={(tuning) => updatePatch({ ...patch, tuning: Number(tuning) })}
              />
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
                      <Pressable accessibilityRole="button" accessibilityLabel={`Ajustar ${label}`} accessibilityState={{ expanded: expandedEffect === key }} onPress={() => setExpandedEffect(expandedEffect === key ? null : key)} style={styles.effectHeading}>
                        <View><Text style={styles.effectTitle}>{label}</Text><Text style={styles.soundDetail}>{effect.on ? "Activado · ajustar" : "Desactivado"}</Text></View>
                        <Text style={styles.previewText}>{expandedEffect === key ? "−" : "+"}</Text>
                      </Pressable>
                      <Switch
                        accessibilityLabel={label}
                        value={effect.on}
                        onValueChange={(on) => { set({ on }); if (on) setExpandedEffect(key); }}
                        trackColor={{ false: colors.line, true: colors.green }}
                      />
                    </View>
                    {expandedEffect === key && (
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
});
const styles = StyleSheet.create({
  back: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 },
  selectContainer: { borderRadius: 18, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  select: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 17, minHeight: 54 },
  optionList: { padding: 6, gap: 2 },
  option: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 12, minHeight: 48 },
  optionSelected: { backgroundColor: colors.sage },
  search: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 17, backgroundColor: colors.soft, borderRadius: 18 },
  searchInput: { flex: 1, minHeight: 54, fontSize: 15, color: colors.ink },
  library: { gap: 9 },
  soundRow: { flexDirection: "row", alignItems: "center", borderRadius: 21, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, paddingRight: 8 },
  selectedRow: { borderColor: "#A4B799", backgroundColor: "#EEF2E7" },
  soundChoice: { flex: 1, flexDirection: "row", alignItems: "center", gap: 13, padding: 13, minHeight: 80 },
  soundIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.soft, alignItems: "center", justifyContent: "center" },
  selectedIcon: { backgroundColor: colors.green },
  soundCopy: { flex: 1, gap: 5 },
  soundTitle: { fontSize: 17, fontWeight: "500", color: colors.ink },
  soundDetail: { fontSize: 11, lineHeight: 17, color: colors.muted, marginTop: 3 },
  editButton: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.soft },
  effectHeading: { flex: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 48, paddingRight: 12 },
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
