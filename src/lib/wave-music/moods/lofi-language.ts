/** Authored musical vocabulary. Data selects INSIDE these complete scenes.
 * See docs/lofi/DESIGN.md for sources, interaction rules and validation targets. */
export const LOFI_LANGUAGE = {
  version: 12,
  tempo: [64, 86],
  scenes: [
    { id: 'muted-strings', name: 'Strumstick cálido', base: 'strumstick', lead: 'pianoforte', baseVelocity: 38, leadVelocity: 43, gate: 1.45, color: .15 },
    { id: 'warm-keys', name: 'Vibráfono suave', base: 'vibraphone', lead: 'pianoforte', baseVelocity: 38, leadVelocity: 44, gate: 2.1, color: .18 },
    { id: 'felt-room', name: 'Piano íntimo', base: 'pianoforte', lead: 'pianoforte', baseVelocity: 34, leadVelocity: 43, gate: 2.35, color: .12 },
  ],
  // Accepted acoustic piano articulation, without pitch modulation.
  solo: { preset: 'pianoforte', attack: 8, color: .08, velocityOffset: -5 },
  // [beat, fifth instead of third, gate in beats, velocity].
  // Central offbeat follows the shared groove swing; the resolution is softer.
  resolvedMotif: {
    question: [[.5,0,.6,39],[1.5,1,.6,36],[2.5,0,.75,35]],
    answer: [[.5,1,.65,36],[1.5,0,1.35,33]],
  },
  harmony: [
    { name: 'Menor circular', scale: [0,2,3,5,7,8,10], routes: [[0,5,3,0],[0,3,6,0]] },
    { name: 'Dórico suave', scale: [0,2,3,5,7,9,10], routes: [[0,3,0,3],[0,6,3,0]] },
    { name: 'Mayor suspendido', scale: [0,2,4,5,7,9,11], routes: [[0,5,3,4],[3,2,5,0]] },
  ],
  keys: [0,2,5,7,9],
  // Roles: theme, answer, harmony foreground, bass foreground. No silent bars.
  forms: [
    ['theme','answer','keys','theme','answer','bass','theme','keys'],
    ['keys','theme','answer','bass','theme','keys','answer','theme'],
    ['theme','keys','answer','theme','bass','answer','keys','theme'],
    ['theme','answer','bass','keys','theme','answer','theme','keys'],
  ],
  rhythms: [[2,6,10],[3,8],[2,7,11],[1,5,9],[3,7,10],[2,9]],
  grooves: [
    { name: 'Pocket', kicks: [[0,8],[0,10]], hats: [[2,6,10,14],[2,6,10]], swing: .13 },
    { name: 'Roto suave', kicks: [[0,7],[0,6]], hats: [[2,6,14],[2,10,14]], swing: .20 },
    { name: 'Abierto', kicks: [[0],[0,8]], hats: [[2,10],[6,14]], swing: .09 },
  ],
  mix: { body: .24, lead: .27, detail: .23, bass: .34, drums: .20 },
  limits: { pitchedVoices: 5, melodyNotes: 3, bassNotes: 2, chordVoices: 3, leadRange: [60,72], bassRange: [33,48] },
} as const;
export type LofiScene = typeof LOFI_LANGUAGE.scenes[number];
export type LofiRole = typeof LOFI_LANGUAGE.forms[number][number];
