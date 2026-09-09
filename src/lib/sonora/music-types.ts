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
  phraseStep?: number;
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
