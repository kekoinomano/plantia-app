import type { Configuration, Patch } from './presets.ts';
export type Lane = 'synth' | 'instrument' | 'greeting';
export type Note = {
  id: number;
  time: number;
  sourceTime: number;
  source: number;
  midi: number;
  velocity: number;
  duration: number;
  lane: Lane;
  slot?: string;
  patch: Patch;
  color: number;
  pan: number;
  fade?: number;
  reason?: string;
  /** Raw event detected before Fourier, with its own reception-clock provenance. */
  rawGreeting?: import('../wave-music/greeting').RawGreeting;
  /** Auditable musical interpretation of a wave-analysis snapshot. */
  wave?: {
    analysis: number; windowSeconds: number; start: number; end: number;
    mean: number; explained: number | null; rmse: number; rule: string;
    components: { id: number; rank: number; frequency: number; amplitude: number;
      phase: number; improvement: number; weight: number }[];
    musicalStep: number; mapping: string;
    contextAnalysis?: number; musicalContext?: Record<string, unknown>;
  };
  /** Acquisition time behind the note, distinct from its audible delivery time. */
  signalTime?: number;
};
export type Expression = {
  brightness: number;
  energy: number;
  direction: number;
  bands: number[];
  space?: number;
  smoothing?: number;
};
export type Event =
  | { type: 'expression'; time: number; expression: Expression }
  | { type: 'note'; time: number; note: Note }
  | { type: 'release'; time: number; lane?: Lane; slot?: string };
export type Soundscape = {
  duration: number;
  config: Configuration;
  events: Event[];
  notes: Note[];
};

export const noteName = (midi: number) =>
  ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][((Math.round(midi)%12)+12)%12] + (Math.floor(midi/12)-1);
