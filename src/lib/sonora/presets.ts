/** Sonora preset format v1: JSON-compatible, effect percentages remain as supplied; synth registers are revised for melodic clarity. */
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
  version: 1;
  synth: Patch;
  instrument: Patch;
  synthMotion: { transition: number; stability: number };
  speed: number;
  synthLevel: number;
  instrumentLevel: number;
  greetingLevel: number;
};
export type Preset = {
  id: string;
  name: string;
  kind: 'synth' | 'instrument';
  patch: Patch;
  program?: string;
  model?: string;
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
];
const pair = (s: string) => (s === '-' ? [0, 0] : s.split('/').map(Number));
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
    flavor,
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
export const SYNTHS = synths.map((r, i) => make(r, 'synth', i));
export const INSTRUMENTS = instruments.map((r, i) => make(r, 'instrument', i));
export const PRESETS = [...SYNTHS, ...INSTRUMENTS];
export const TUNINGS = [420, 432, 440, 464];
export const preset = (id: string) =>
  PRESETS.find((p) => p.id === id) ?? SYNTHS[0];
export const copyPatch = (id: string): Patch =>
  JSON.parse(JSON.stringify(preset(id).patch));
export function defaultConfiguration(): Configuration {
  return {
    version: 1,
    synth: copyPatch('healing'),
    instrument: copyPatch('harp'),
    synthMotion: { transition: 4.5, stability: 78 },
    speed: 1,
    synthLevel: 0.55,
    instrumentLevel: 0.95,
    greetingLevel: 1,
  };
}
const limit = (n: number, a: number, b: number) =>
  Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : a;
export function sanitizeConfiguration(input: Configuration): Configuration {
  const c = JSON.parse(JSON.stringify(input)) as Configuration;
  const synthMotion = c.synthMotion as Configuration['synthMotion'] & {
    glide?: number;
  };
  c.synthMotion = {
    transition: limit(synthMotion?.transition ?? synthMotion?.glide ?? 4.5, 1, 8),
    stability: limit(synthMotion?.stability ?? 78, 0, 100),
  };
  for (const lane of ['synth', 'instrument'] as const) {
    const p = c[lane];
    if (!PRESETS.some((x) => x.id === p.preset && x.kind === lane))
      throw Error('Preset no válido');
    p.notes = [
      ...new Set(
        p.notes.filter((n) => Number.isInteger(n) && n >= 0 && n < 12),
      ),
    ].sort((a, b) => a - b);
    if (!p.notes.length) throw Error('Selecciona al menos una nota');
    p.octaves = [
      Math.round(limit(p.octaves[0], 1, 6)),
      Math.round(limit(p.octaves[1], 1, 6)),
    ].sort((a, b) => a - b) as [number, number];
    p.tuning = limit(p.tuning, 392, 494);
    for (const effect of [p.delay, p.reverb, p.chorus, p.envelope])
      for (const key of Object.keys(effect))
        if (key !== 'on')
          (effect as unknown as Record<string, number>)[key] = limit(
            (effect as unknown as Record<string, number>)[key],
            0,
            100,
          );
    p.velocity = {
      range: limit(p.velocity.range, 0, 127),
      center: limit(p.velocity.center, 0, 127),
    };
  }
  c.speed = limit(c.speed, 0.25, 2);
  c.synthLevel = limit(c.synthLevel, 0, 1);
  c.instrumentLevel = limit(c.instrumentLevel, 0, 1);
  c.greetingLevel = limit(c.greetingLevel, 0, 1);
  c.version = 1;
  return c;
}
export function notePool(p: Patch) {
  const notes: number[] = [];
  for (let o = p.octaves[0]; o <= p.octaves[1]; o++)
    for (const n of p.notes) notes.push(12 * (o + 1) + n);
  return notes;
}
