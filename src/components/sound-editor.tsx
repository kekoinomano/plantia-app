import { memo, useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Slider from "@react-native-community/slider";
import { SafeAreaView } from "react-native-safe-area-context";
import { SCALES, TUNINGS, allowedPresets, preset, soundSlots } from "@/lib/sonora/presets";
import { plantSession, usePlantSessionValue } from "@/lib/plant-session";
import { mood } from "@/lib/sonora/moods";
import { colors, serif } from "./plantia-theme";
import { Icon } from "./plant-icon";

export function SoundSlider({ label, value, onChange, min = 0, max = 100, step = 1,
  unit = "%" }: {
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
  return <View style={styles.sliderBlock}>
    <View style={styles.between}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.number}>{Number(draft.toFixed(2))}{unit}</Text>
    </View>
    <Slider accessibilityLabel={label} style={styles.slider} value={value}
      minimumValue={min} maximumValue={max} step={step} onValueChange={setDraft}
      onSlidingComplete={onChange} minimumTrackTintColor={colors.green}
      maximumTrackTintColor={colors.line} thumbTintColor={colors.green} />
  </View>;
}

function Choices({ options, selected, onSelect }: {
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return <View style={styles.selectContainer}>
    <Pressable accessibilityRole="button"
      accessibilityLabel={`Cambiar ${options.find((option) => option.value === selected)?.label ?? selected}`}
      accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.select}>
      <Text style={styles.label}>{options.find((option) => option.value === selected)?.label ?? selected}</Text>
      <View style={{ transform: [{ rotate: open ? "270deg" : "90deg" }] }}>
        <Icon name="chevron" size={16} />
      </View>
    </Pressable>
    {open && <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={styles.optionList}
      nestedScrollEnabled keyboardShouldPersistTaps="handled">
      {options.map((option) => <Pressable key={option.value} accessibilityRole="button"
        accessibilityState={{ selected: option.value === selected }}
        onPress={() => { onSelect(option.value); setOpen(false); }}
        style={[styles.option, option.value === selected && styles.optionSelected]}>
        <Text style={styles.label}>{option.label}</Text>
        {option.value === selected && <Icon name="check" size={17} />}
      </Pressable>)}
    </ScrollView>}
  </View>;
}

export function soundIcon(id: string): "wave" | "keys" | "bell" | "strings" | "wind" {
  const sound = preset(id);
  if (sound.kind === "synth") return "wave";
  if (/bell|chime|bowl|drum|marimba|xylo|bongo|conga|timbal|maraca|taiko|timpani|kalimba/i
    .test(`${sound.name} ${sound.model} ${sound.program}`)) return "bell";
  if (/sitar|guitar|harp|string/i.test(`${sound.name} ${sound.program}`)) return "strings";
  if (sound.family === "wind") return "wind";
  return "keys";
}

export const SoundEditor = memo(function SoundEditor({ lane, onClose }: {
  lane: string | null;
  onClose: () => void;
}) {
  const config = usePlantSessionValue((state) => state.config);
  const playing = usePlantSessionValue((state) => state.playing);
  const connection = usePlantSessionValue((state) => state.connection);
  const scroll = useRef<ScrollView>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    setQuery("");
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [lane]);
  const selectedMood = mood(config.mood);
  const slots = soundSlots(config).filter((slot) =>
    !selectedMood.slots.find((definition) => definition.id === slot.id)?.hidden);
  const slot = slots.find((candidate) => candidate.id === lane);
  const definition = selectedMood.slots.find((candidate) => candidate.id === lane);
  const instruments = definition?.kind === "instrument" ? allowedPresets(definition) : [];
  const title = lane === "mix" ? `Ajustes de ${selectedMood.name}` :
    definition ? `Elige ${definition.label.toLocaleLowerCase()}` : "Instrumentos";

  return <Modal visible={lane !== null} animationType="slide" presentationStyle="pageSheet"
    onRequestClose={onClose}>
    <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
      <View style={styles.modalHeader}>
        <Text style={styles.eyebrow}>{lane === "mix" ? "AFINACIÓN Y MEZCLA" : "MISMA FAMILIA"}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar ajustes"
          onPress={onClose} style={styles.close}><Icon name="close" /></Pressable>
      </View>
      <ScrollView ref={scroll} contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{lane === "mix"
          ? "La partitura, los registros, el ritmo, las articulaciones y los efectos pertenecen al mood. Tú decides su tonalidad y el peso de cada voz."
          : "Puedes cambiar esta voz por otro instrumento de su familia. El mood seguirá decidiendo cómo debe tocar."}</Text>

        {lane === "mix" ? <>
          <Text style={styles.section}>ARMONÍA GENERAL</Text>
          <Text style={styles.label}>Escala</Text>
          <Choices options={Object.keys(SCALES).map((value) => ({ value, label: value }))}
            selected={config.harmony.scale}
            onSelect={(scale) => plantSession.configure({ ...config,
              harmony: { ...config.harmony, scale, notes: [...SCALES[scale]] } })} />
          <Text style={styles.label}>Frecuencia</Text>
          <Choices options={TUNINGS.map((value) => ({ value: String(value), label: `${value} Hz` }))}
            selected={String(config.harmony.tuning)}
            onSelect={(tuning) => plantSession.configure({ ...config,
              harmony: { ...config.harmony, tuning: Number(tuning) } })} />
          <Text style={styles.section}>VOLUMEN DE LAS VOCES</Text>
          {slots.map((candidate) => <SoundSlider key={candidate.id}
            label={selectedMood.slots.find((item) => item.id === candidate.id)?.label ?? candidate.id}
            value={candidate.level * 100}
            onChange={(value) => plantSession.setSlotLevel(candidate.id, value / 100)} />)}
        </> : definition?.kind === "instrument" && slot ? <>
          <Pressable accessibilityRole="button" disabled={!playing || connection !== "connected"}
            onPress={() => plantSession.preview(slot.id)}
            style={[styles.preview, (!playing || connection !== "connected") && { opacity: 0.4 }]}>
            <Icon name="play" size={17} />
            <Text style={styles.previewText}>Escuchar instrumento actual</Text>
          </Pressable>
          <View style={styles.search}>
            <Icon name="search" size={19} color={colors.muted} />
            <TextInput accessibilityLabel="Buscar instrumentos" placeholder="Buscar un instrumento…"
              placeholderTextColor={colors.muted} value={query} onChangeText={setQuery}
              autoCorrect={false} style={styles.searchInput} />
          </View>
          <View style={styles.library}>
            {instruments.filter((candidate) => candidate.name.toLocaleLowerCase()
              .includes(query.trim().toLocaleLowerCase())).map((candidate) => {
              const selected = candidate.id === slot.patch.preset;
              return <Pressable key={candidate.id} accessibilityRole="button"
                accessibilityLabel={`Elegir ${candidate.name}`} accessibilityState={{ selected }}
                onPress={() => { plantSession.selectInstrument(slot.id, candidate.id); onClose(); }}
                style={[styles.soundRow, selected && styles.selectedRow]}>
                <View style={[styles.soundIcon, selected && styles.selectedIcon]}>
                  <Icon name={soundIcon(candidate.id)} color={selected ? colors.paper : colors.green} size={25} />
                </View>
                <View style={styles.soundCopy}>
                  <Text style={styles.soundTitle}>{candidate.name}</Text>
                  <Text style={styles.soundDetail}>{selected ? "Instrumento actual" : candidate.description ?? "Misma familia musical"}</Text>
                </View>
                {selected && <Icon name="check" size={18} color={colors.green} />}
              </Pressable>;
            })}
          </View>
        </> : null}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
});

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.background },
  modalHeader: { paddingHorizontal: 25, paddingTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eyebrow: { fontSize: 10, letterSpacing: 2, color: colors.muted, fontWeight: "600" },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.soft },
  content: { padding: 25, paddingTop: 10, paddingBottom: 45, gap: 18, maxWidth: 640, width: "100%", alignSelf: "center" },
  title: { fontFamily: serif, fontSize: 33, color: colors.ink },
  description: { fontSize: 13, lineHeight: 21, color: colors.muted },
  section: { color: colors.muted, letterSpacing: 2, fontSize: 10, marginTop: 14 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  sliderBlock: { gap: 5 },
  label: { fontSize: 13, color: colors.ink },
  number: { fontSize: 12, color: colors.muted, fontVariant: ["tabular-nums"] },
  slider: { height: 35, marginHorizontal: -2 },
  selectContainer: { borderRadius: 18, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  select: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 17, minHeight: 54 },
  optionList: { padding: 6, gap: 2 },
  option: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 12, minHeight: 48 },
  optionSelected: { backgroundColor: colors.sage },
  preview: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, padding: 15, backgroundColor: colors.sage, borderRadius: 18 },
  previewText: { fontSize: 13, fontWeight: "500", color: colors.ink },
  search: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 17, backgroundColor: colors.soft, borderRadius: 18 },
  searchInput: { flex: 1, minHeight: 54, fontSize: 15, color: colors.ink },
  library: { gap: 9 },
  soundRow: { flexDirection: "row", alignItems: "center", gap: 13, padding: 13, minHeight: 80, borderRadius: 21, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  selectedRow: { borderColor: "#A4B799", backgroundColor: "#EEF2E7" },
  soundIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.soft, alignItems: "center", justifyContent: "center" },
  selectedIcon: { backgroundColor: colors.green },
  soundCopy: { flex: 1, gap: 5 },
  soundTitle: { fontSize: 17, fontWeight: "500", color: colors.ink },
  soundDetail: { fontSize: 11, lineHeight: 17, color: colors.muted, marginTop: 3 },
});
