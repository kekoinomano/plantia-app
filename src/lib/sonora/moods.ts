export type SoundFamily = 'ambient' | 'percussion' | 'wind' | 'strings' | 'keys' | 'voice';
export type MoodSlot = {
  id: string;
  label: string;
  kind: 'synth' | 'instrument';
  families?: readonly SoundFamily[];
  defaultPreset: string;
  level: number;
  /** Internal orchestral colour: composed by the mood and never exposed as a control. */
  hidden?: boolean;
  /** Register owned by the mood; it is never exposed as a user control. */
  octaves?: readonly [number, number];
  role?: 'foundation' | 'pad' | 'lead' | 'counterline' | 'pulse' | 'accent';
};
export type MoodScore = {
  style: 'organic' | 'serene' | 'drift' | 'psychedelic' | 'ritual';
  harmony: { scale: string; notes: readonly number[]; tuning: number };
  /** Roots expressed as indices in the shared scale. */
  progression: readonly number[];
};
export type Mood = {
  id: string;
  name: string;
  description: string;
  slots: readonly MoodSlot[];
  score: MoodScore;
  modulation: { brightness: number; energy: number; space: number; smoothing: number };
};
// Slot IDs are stable within a mood. The score owns notes, register, articulation and effects.
export const MOODS: readonly Mood[] = [
  {
    id: 'organic', name: 'Orgánico',
    description: 'Una melodía viva sobre un fondo suave.',
    score: {
      style: 'organic',
      harmony: { scale: 'Maj Pentatonic', notes: [0, 2, 4, 7, 9], tuning: 432 },
      progression: [0, 3, 4, 1],
    },
    slots: [
      { id: 'ground', label: 'Fondo orgánico', kind: 'synth', defaultPreset: 'meadow', level: 0.96, octaves: [2, 4], role: 'foundation' },
      { id: 'melody', label: 'Voz orgánica', kind: 'instrument', families: ['strings'], defaultPreset: 'harp', level: 1, octaves: [3, 5], role: 'lead' },
      { id: 'visitor', label: 'Viento invitado', kind: 'instrument', families: ['wind'], defaultPreset: 'pan-flute', level: 0.78, octaves: [3, 4], role: 'accent', hidden: true },
    ],
    modulation: { brightness: 0.3, energy: 0.25, space: 8, smoothing: 0.4 },
  },
  {
    id: 'serene', name: 'Sereno',
    description: 'Dos fondos cálidos sostienen una conversación lenta de arpa y viento.',
    score: {
      style: 'serene',
      harmony: { scale: 'Maj Pentatonic', notes: [0, 2, 4, 7, 9], tuning: 432 },
      progression: [0, 3, 4, 1],
    },
    slots: [
      { id: 'ground', label: 'Fondo grave', kind: 'synth', defaultPreset: 'meadow', level: 0.94, octaves: [2, 3], role: 'foundation' },
      { id: 'air', label: 'Fondo de aire', kind: 'synth', defaultPreset: 'peace', level: 0.88, octaves: [3, 4], role: 'pad' },
      { id: 'lead', label: 'Voz principal', kind: 'instrument', families: ['strings'], defaultPreset: 'harp', level: 1, octaves: [3, 5], role: 'lead' },
      { id: 'answer', label: 'Respuesta de viento', kind: 'instrument', families: ['wind'], defaultPreset: 'shakuhachi', level: 0.76, octaves: [3, 4], role: 'counterline' },
    ],
    modulation: { brightness: 0.26, energy: 0.2, space: 12, smoothing: 1.1 },
  },
  {
    id: 'drift', name: 'Deriva',
    description: 'Una constelación de sintetizadores; la campana solo aparece para señalar cambios.',
    score: {
      style: 'drift',
      harmony: { scale: 'Lydian', notes: [0, 2, 4, 6, 7, 9, 11], tuning: 440 },
      progression: [0, 1, 4, 2],
    },
    slots: [
      { id: 'horizon', label: 'Horizonte', kind: 'synth', defaultPreset: 'space-time', level: 0.96, octaves: [2, 3], role: 'foundation' },
      { id: 'cloud', label: 'Nube', kind: 'synth', defaultPreset: 'mandala', level: 0.9, octaves: [3, 4], role: 'pad' },
      { id: 'glint', label: 'Destello', kind: 'synth', defaultPreset: 'crystal', level: 0.72, octaves: [4, 5], role: 'accent' },
      { id: 'marker', label: 'Señal', kind: 'instrument', families: ['percussion'], defaultPreset: 'tibetan-bell', level: 0.84, octaves: [3, 4], role: 'accent' },
    ],
    modulation: { brightness: 0.42, energy: 0.26, space: 20, smoothing: 1.3 },
  },
  {
    id: 'prism', name: 'Prisma',
    description: 'Capas modales, pulsos cruzados y color estéreo alrededor de un centro estable.',
    score: {
      style: 'psychedelic',
      harmony: { scale: 'Doric', notes: [0, 2, 3, 5, 7, 9, 10], tuning: 432 },
      progression: [0, 3, 1, 4, 2, 0],
    },
    slots: [
      { id: 'tide', label: 'Marea', kind: 'synth', defaultPreset: 'velvet', level: 0.96, octaves: [2, 3], role: 'foundation' },
      { id: 'spiral', label: 'Espiral', kind: 'synth', defaultPreset: 'prism-dust', level: 0.88, octaves: [3, 4], role: 'pad' },
      { id: 'aura', label: 'Aura', kind: 'synth', defaultPreset: 'beauty', level: 0.76, octaves: [4, 5], role: 'counterline' },
      { id: 'apparition', label: 'Aparición', kind: 'instrument', families: ['strings'], defaultPreset: 'sitar', level: 0.82, octaves: [3, 5], role: 'accent' },
    ],
    modulation: { brightness: 0.58, energy: 0.46, space: 24, smoothing: 0.65 },
  },
  {
    id: 'ritual', name: 'Ritual',
    description: 'Pulso de tierra, respiración de viento y una armonía que crece por capas.',
    score: {
      style: 'ritual',
      harmony: { scale: 'Min Pentatonic', notes: [0, 3, 5, 7, 10], tuning: 440 },
      progression: [0, 3, 2, 0],
    },
    slots: [
      { id: 'earth', label: 'Tierra', kind: 'synth', defaultPreset: 'meditation', level: 0.94, octaves: [2, 3], role: 'foundation' },
      { id: 'pulse', label: 'Pulso', kind: 'instrument', families: ['percussion'], defaultPreset: 'congas', level: 1, role: 'pulse' },
      { id: 'breath', label: 'Aliento', kind: 'instrument', families: ['wind'], defaultPreset: 'shakuhachi', level: 0.94, octaves: [3, 5], role: 'lead' },
      { id: 'embers', label: 'Brasas', kind: 'instrument', families: ['percussion'], defaultPreset: 'kalimba', level: 0.86, octaves: [3, 4], role: 'counterline' },
    ],
    modulation: { brightness: 0.46, energy: 0.5, space: 14, smoothing: 0.55 },
  },
];
export const mood = (id?: string): Mood => MOODS.find((m) => m.id === id) ?? MOODS[0];
