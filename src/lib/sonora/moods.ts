export type SoundFamily = 'ambient' | 'percussion' | 'wind' | 'strings' | 'keys' | 'voice';
export type MoodSlot = {
  id: string;
  label: string;
  kind: 'synth' | 'instrument';
  families?: readonly SoundFamily[];
  defaultPreset: string;
  level: number;
};
export type Mood = {
  id: string;
  name: string;
  description: string;
  rules: 'organic' | 'mist' | 'grove';
  slots: readonly MoodSlot[];
  modulation: { brightness: number; energy: number; space: number; smoothing: number };
};
// Slot IDs are stable within a mood. Effects and volume belong to a slot, not a family.
export const MOODS: readonly Mood[] = [
  {
    id: 'organic', name: 'Orgánico', rules: 'organic',
    description: 'Una melodía viva sobre un ambiente suave.',
    slots: [
      { id: 'atmosphere', label: 'Ambiente', kind: 'synth', defaultPreset: 'healing', level: 0.55 },
      { id: 'melody', label: 'Melodía', kind: 'instrument', defaultPreset: 'harp', level: 0.95 },
    ],
    modulation: { brightness: 0.3, energy: 0.25, space: 8, smoothing: 0.4 },
  },
  {
    id: 'mist', name: 'Bruma', rules: 'mist',
    description: 'Nubes armónicas, destellos y silencios que siguen la forma de la señal.',
    slots: [{ id: 'cloud', label: 'Nube sonora', kind: 'synth', defaultPreset: 'enlightenment', level: 0.8 }],
    modulation: { brightness: 0.4, energy: 0.3, space: 18, smoothing: 1.2 },
  },
  {
    id: 'grove', name: 'Sotobosque', rules: 'grove',
    description: 'Polirritmos y frases de viento: la planta pregunta, responde y respira.',
    slots: [
      { id: 'ground', label: 'Fondo', kind: 'synth', defaultPreset: 'meditation', level: 0.35 },
      { id: 'pulse', label: 'Percusión', kind: 'instrument', families: ['percussion'], defaultPreset: 'congas', level: 0.8 },
      { id: 'breath', label: 'Viento', kind: 'instrument', families: ['wind'], defaultPreset: 'pan-flute', level: 0.8 },
    ],
    modulation: { brightness: 0.5, energy: 0.45, space: 22, smoothing: 0.5 },
  },
];
export const mood = (id?: string): Mood => MOODS.find((m) => m.id === id) ?? MOODS[0];
