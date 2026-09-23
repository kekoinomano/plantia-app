import { profile, type ProfileId } from './focus.ts';
import { ensemblePlan } from './orchestration.ts';
import { waveMood } from '../wave-music/registry';
export type SoundFamily = 'ambient' | 'percussion' | 'wind' | 'strings' | 'keys' | 'voice';
/** Sonora preset format v1: JSON-compatible; old saved configurations remain valid. */
export const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
];
export const SCALES: Record<string, number[]> = {
  Chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  Ionian: [0, 2, 4, 5, 7, 9, 11],
  Doric: [0, 2, 3, 5, 7, 9, 10],
  Phrygian: [0, 1, 3, 5, 7, 8, 10],
  Lydian: [0, 2, 4, 6, 7, 9, 11],
  Mixolydian: [0, 2, 4, 5, 7, 9, 10],
  Aeolian: [0, 2, 3, 5, 7, 8, 10],
  Locrio: [0, 1, 3, 5, 6, 8, 10],
  'Major third': [0, 4, 8],
  'Minor third': [0, 3, 6, 9],
  Fifth: [0, 7],
  'Major Blues': [0, 2, 3, 4, 7, 9],
  'Minor Blues': [0, 3, 5, 6, 7, 10],
  Diminish: [0, 2, 3, 5, 6, 8, 9, 11],
  'Maj Pentatonic': [0, 2, 4, 7, 9],
  'Min Pentatonic': [0, 3, 5, 7, 10],
  Spanish: [0, 1, 4, 5, 7, 8, 10],
  Gypsy: [0, 2, 3, 6, 7, 8, 11],
  Arabian: [0, 2, 4, 5, 6, 8, 10],
  Indian: [0, 1, 4, 5, 7, 8, 11],
  Ryukyu: [0, 4, 5, 7, 11],
  wholetone: [0, 2, 4, 6, 8, 10],
};
export type Patch = {
  preset: string;
  scale: string;
  notes: number[];
  octaves: [number, number];
  tuning: number;
  velocity: { range: number; center: number };
  delay: { on: boolean; wet: number; rate: number };
  reverb: { on: boolean; wet: number; amount: number };
  chorus: { on: boolean; depth: number; rate: number };
  envelope: { on: boolean; release: number; attack: number };
};
export type Configuration = {
  version: 2;
  volume: number;
  profile: ProfileId;
  /** User-facing musical overrides shared by every mood layer. */
  scale: string;
  tuning: number;
  slots?: SoundSlot[];
  synth: Patch;
  instrument: Patch;
  synthMotion: { transition: number; stability: number };
  speed: number;
  synthLevel: number;
  instrumentLevel: number;
  greetingLevel: number;
};
export type SoundSlot = {
  id: string; kind: 'synth' | 'instrument'; patch: Patch; level: number;
  motion?: { transition: number; stability: number };
};
export type Preset = {
  id: string;
  name: string;
  kind: 'synth' | 'instrument';
  family: SoundFamily;
  patch: Patch;
  program?: string;
  model?: string;
  percussion?: number[];
  flavor: number;
  description?: string;
};
type Row = [string, string, string, string, string, string, string, string?];
const synths: Row[] = [
  ['Healing', 'Ionian', '2-6', '30/99', '57/86', '-', '50/99'],
  ['Enlightenment', 'Maj Pentatonic', '3-5', '25/99', '84/75', '-', '0/99'],
  ['Chakra', 'Ionian', '2-5', '84/81', '95/92', '-', '50/15'],
  ['Beauty', 'Lydian', '3-6', '95/69', '73/99', '95/86', '100/15'],
  ['Astral', 'Lydian', '3-6', '52/63', '41/63', '52/63', '100/15'],
  ['Connection', 'Min Pentatonic', '2-4', '19/99', '100/99', '100/99', '0/99'],
  ['Illusion', 'Ionian', '3-5', '84/86', '100/99', '84/98', '82/99'],
  ['Space Time', 'Doric', '2-5', '79/81', '52/86', '-', '100/9'],
  ['Meditation', '0,3,7', '2-5', '73/92', '30/99', '-', '39/99'],
  ['Energy', 'Lydian', '3-5', '95/92', '73/52', '100/98', '60/38'],
  ['Mistery', 'Ionian', '2-5', '73/63', '41/75', '-', '100/26'],
  ['Flower', 'Locrio', '3-5', '8/99', '24/99', '73/86', '100/61'],
  ['Seed', 'Maj Pentatonic', '3-5', '68/75', '-', '95/75', '39/61'],
  ['Crystal', 'Gypsy', '4-6', '63/58', '73/86', '-', '100/21'],
  ['Mandala', 'Min Pentatonic', '2-5', '41/99', '100/98', '100/99', '100/3'],
  ['Peace', '2,3,5,6', '3-5', '100/92', '41/75', '95/86', '50/0'],
  ['Sun', 'Doric', '3-6', '95/86', '100/99', '73/86', '100/21'],
  ['Lead', 'Min Pentatonic', '3-5', '73/75', '100/99', '73/11', '50/73'],
  ['Infinity', 'Maj Pentatonic', '3-6', '14/99', '52/86', '95/52', '100/26'],
  ['Non Duality', 'Ryukyu', '3-5', '90/34', '19/99', '73/63', '100/9'],
];
const instruments: Row[] = [
  ['Electric Piano', 'Doric', '2-5', '-', '18/45', '8/10', '52/2', 'model:rhodes'],
  ['Round Bass', 'Ionian', '1-3', '-', '-', '-', '15/1', 'model:bass'],
  ['Soft Kick', '0', '2-2', '-', '-', '-', '4/0', 'model:kick'],
  ['Brush Snare', '2', '2-2', '-', '-', '-', '3/0', 'model:snare'],
  ['Soft Hat', '6', '2-2', '-', '-', '-', '2/0', 'model:hat'],
  ['Bongos', '0,1', '4-4', '-', '12/20', '-', '12/0', 'bongos'],
  ['Congas', '2,3,4', '4-4', '-', '14/25', '-', '16/0', 'congas'],
  ['Timbales', '5,6', '4-4', '-', '12/20', '-', '12/0', 'timbales'],
  ['Maracas', '10', '4-4', '-', '8/15', '-', '8/0', 'maracas'],
  ['Taiko', 'Min Pentatonic', '2-4', '-', '18/30', '-', '20/0', 'taiko_drum'],
  ['Timpani', 'Ionian', '2-4', '-', '20/35', '-', '25/0', 'timpani'],
  ['Kalimba', 'Maj Pentatonic', '3-5', '10/92', '20/30', '-', '25/0', 'kalimba'],
  [
    'Pan Flute',
    'Maj Pentatonic',
    '2-4',
    '14/86',
    '-',
    '-',
    '50/26',
    'pan_flute',
  ],
  [
    'Hang Drum',
    '0,2,3,6,7,10',
    '1-6',
    '14/99',
    '-',
    '-',
    '100/0',
    'steel_drums',
  ],
  ['Koshi', 'Ryukyu', '1-3', '35/93', '19/75', '79/81', '100/0', 'model:chime'],
  [
    'Church Organ',
    'Mixolydian',
    '1-4',
    '8/99',
    '84/75',
    '-',
    '50/26',
    'church_organ',
  ],
  [
    'Pianoforte',
    'Lydian',
    '2-5',
    '19/99',
    '52/75',
    '-',
    '100/0',
    'acoustic_grand_piano',
  ],
  ['Woodwinds', 'Locrio', '1-4', '8/99', '-', '-', '100/0', 'oboe'],
  ['Marimba', 'Lydian', '1-4', '3/99', '41/52', '-', '100/0', 'marimba'],
  ['Tibetan Bell', 'Locrio', '1-3', '3/99', '-', '-', '100/0', 'model:bowl'],
  ['Xilophone', 'Ryukyu', '1-4', '25/40', '84/86', '-', '100/0', 'xylophone'],
  ['Sitar', '0,1,4,7,10', '2-6', '30/99', '100/99', '73/40', '0/99', 'sitar'],
  [
    'Mixed Choir',
    'Locrio',
    '2-6',
    '8/99',
    '19/17',
    '-',
    '100/73',
    'choir_aahs',
  ],
  [
    'Metal Bell',
    'Ionian',
    '1-5',
    '14/99',
    '41/75',
    '-',
    '100/0',
    'tubular_bells',
  ],
  [
    'Choir and Organ',
    'Lydian',
    '1-4',
    '8/99',
    '30/52',
    '-',
    '100/73',
    'choir_organ',
  ],
  [
    'Brass Ensemble',
    'Aeolian',
    '1-5',
    '3/99',
    '25/40',
    '-',
    '100/38',
    'brass_section',
  ],
  [
    'Orchestal Strings',
    'Aeolian',
    '1-4',
    '3/99',
    '25/40',
    '-',
    '100/73',
    'string_ensemble_1',
  ],
  [
    'Guitar',
    'Min Pentatonic',
    '2-5',
    '41/29',
    '25/34',
    '30/17',
    '100/0',
    'acoustic_guitar_nylon',
  ],
  [
    'Harp',
    'Lydian',
    '2-6',
    '19/99',
    '41/86',
    '84/29',
    '100/0',
    'orchestral_harp',
  ],
  ['Shakuhachi', 'Min Pentatonic', '3-5', '12/92', '28/40', '-', '28/12', 'shakuhachi'],
  ['Ocarina', 'Maj Pentatonic', '4-6', '10/92', '23/35', '-', '22/8', 'ocarina'],
  ['Flauta dulce', 'Doric', '3-5', '8/92', '20/30', '-', '25/10', 'recorder'],
  ['Shanai', 'Min Pentatonic', '3-5', '8/94', '18/28', '-', '20/6', 'shanai'],
  ['Flauta de botella', 'Maj Pentatonic', '3-5', '14/93', '26/40', '-', '26/14', 'blown_bottle'],
];
const pair = (s: string) => (s === '-' ? [0, 0] : s.split('/').map(Number));
const percussionHits: Record<string, number[]> = {
  bongos: [60, 61], congas: [62, 63, 64], timbales: [65, 66], maracas: [70],
};
function make(row: Row, kind: Preset['kind'], flavor: number): Preset {
  const [name, scale, oct, del, rev, cho, env, source] = row,
    id = name.toLowerCase().replaceAll(' ', '-');
  const [dw, dr] = pair(del),
    [rw, ra] = pair(rev),
    [cd, cr] = pair(cho),
    [er, ea] = pair(env);
  return {
    id,
    name,
    kind,
    family: kind === 'synth' ? 'ambient' :
      /bongo|conga|timbal|maraca|taiko|timpani|kalimba|drum|marimba|xylo|bell|model:/.test(source ?? '') ? 'percussion' :
      /flute|oboe|brass|shakuhachi|ocarina|recorder|shanai|blown_bottle/.test(source ?? '') ? 'wind' :
      /harp|guitar|string|sitar/.test(source ?? '') ? 'strings' :
      /choir/.test(source ?? '') ? 'voice' : 'keys',
    flavor,
    percussion: source ? percussionHits[source] : undefined,
    description: source && percussionHits[source] ? 'Percusión · golpes originales sin transposición' :
      ['taiko_drum', 'timpani', 'kalimba'].includes(source ?? '') ? 'Percusión afinada' : undefined,
    program: source?.startsWith('model:') ? undefined : source,
    model: source?.startsWith('model:') ? source.slice(6) : undefined,
    patch: {
      preset: id,
      scale: SCALES[scale] ? scale : 'Custom',
      notes: [...(SCALES[scale] ?? scale.split(',').map(Number))],
      octaves: oct.split('-').map(Number) as [number, number],
      tuning: 440,
      velocity: { range: 127, center: 72 },
      delay: { on: del !== '-', wet: dw, rate: dr },
      reverb: { on: rev !== '-', wet: rw, amount: ra },
      chorus: { on: cho !== '-', depth: cd, rate: cr },
      envelope: { on: env !== '-', release: er, attack: ea },
    },
  };
}
export const SYNTHS = [...synths,
  ['Sleep Air', 'Maj Pentatonic', '2-4', '-', '48/85', '-', '90/95'] as Row,
  ['Sleep Halo', 'Maj Pentatonic', '2-4', '-', '52/88', '5/3', '92/98'] as Row,
  ['Prism Pedal', 'Maj Pentatonic', '2-4', '-', '40/75', '16/4', '80/85'] as Row,
  ['Magnetic Pedal', 'Maj Pentatonic', '2-4', '-', '38/72', '22/5', '80/85'] as Row,
  ['Liquid Nebula', 'Maj Pentatonic', '3-5', '-', '44/78', '48/5', '80/85'] as Row,
  ['Spectral Bloom', 'Maj Pentatonic', '3-5', '-', '38/72', '52/7', '80/85'] as Row,
  ['Spiral Reed', 'Maj Pentatonic', '3-5', '52/49', '38/72', '48/9', '24/65'] as Row,
].map((r, i) => make(r, 'synth', i));
export const INSTRUMENTS = instruments.map((r, i) => make(r, 'instrument', i));
export const PRESETS = [...SYNTHS, ...INSTRUMENTS];
export const TUNINGS = [432, 440, 528] as const;
export const preset = (id: string) =>
  PRESETS.find((p) => p.id === id) ?? SYNTHS[0];
export const copyPatch = (id: string): Patch =>
  JSON.parse(JSON.stringify(preset(id).patch));
/** Renderer compatibility fields are derived, never user-authored patches. */
export function performancePatch(id: string, slot: string, profileId: string): Patch {
  return waveMood(profile(profileId).id)!.patch(id, slot);
}
export function defaultConfiguration(): Configuration {
  return sanitizeConfiguration({ version: 2, volume: 1 } as Configuration);
}
/** Old mood/patch settings intentionally migrate to the new listening experience. */
export function sanitizeConfiguration(input: Configuration): Configuration {
  const volume = Number.isFinite(input.volume) ? Math.max(0, Math.min(1, input.volume)) : 1;
  const p = profile(input.profile);
  const e = ensemblePlan(p.id);
  const defaultScale = Object.entries(SCALES).find(([, notes]) =>
    notes.length === p.notes.length && notes.every((note, index) => note === p.notes[index]))?.[0] ?? 'Chromatic';
  const scale = input.scale && SCALES[input.scale] ? input.scale : defaultScale;
  const tuning = TUNINGS.includes(input.tuning as (typeof TUNINGS)[number]) ? input.tuning : p.tuning;
  const musicalPatch = (patch: Patch) => preset(patch.preset).percussion ? patch : {
    ...patch, scale, notes: [...SCALES[scale]], tuning,
  };
  const makePatch = (id: string, slot: string) => musicalPatch(performancePatch(id, slot, p.id));
  const synth = makePatch(p.body[0], 'foundation');
  const instrument = makePatch(p.lead[0], 'contour');
  const synthMotion = { transition: p.harmony.fade, stability: 90 };
  return {
    version: 2, profile: p.id, volume, scale, tuning,
    synth, instrument, synthMotion, speed: 1,
    synthLevel: p.mix.body * volume, instrumentLevel: p.mix.lead * volume, greetingLevel: 0,
    slots: [
      { id: 'foundation', kind: e.foundationKind, patch: synth, level: p.mix.body * volume, motion: synthMotion },
      { id: 'contour', kind: 'instrument', patch: instrument, level: p.mix.lead * volume },
      { id: 'detail', kind: 'instrument', patch: makePatch(p.detail[0], 'detail'), level: p.mix.detail * volume },
      { id: 'accompaniment', kind: 'instrument', patch: makePatch(e.accompaniment[0], 'accompaniment'), level: e.levels.accompaniment * volume },
      { id: 'bass', kind: 'instrument', patch: makePatch(e.bass[0], 'bass'), level: e.levels.bass * volume },
      { id: 'texture', kind: e.textureKind, patch: makePatch(e.texture[0], 'texture'), level: e.levels.texture * volume },
      { id: 'percussion', kind: 'instrument', patch: makePatch('soft-kick', 'percussion'), level: e.levels.percussion * volume },
      { id: 'counter', kind: e.counterKind ?? 'instrument', patch: makePatch(e.counter[0], 'counter'), level: e.levels.counter * volume },
    ],
  };
}
export function notePool(p: Patch) {
  const hits = preset(p.preset).percussion;
  if (hits) return [...hits];
  const notes: number[] = [];
  for (let o = p.octaves[0]; o <= p.octaves[1]; o++)
    for (const n of p.notes) notes.push(12 * (o + 1) + n);
  return notes;
}

export const soundSlots = (config: Configuration): SoundSlot[] =>
  config.slots ?? sanitizeConfiguration(config).slots!;
export function audioChannels(config: Configuration) {
  // Keep the silent final bus for the existing JS/native renderer protocol.
  return [...soundSlots(config), {
    id: '$greeting', kind: 'greeting' as const, patch: config.instrument, level: 0,
  }];
}
