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
  /** Seconds into a non-transposed ambience recording. */
  sampleOffset?: number;
  /** Synth-only semitone offsets at the start, midpoint and end of the gate. */
  pitchCurve?: [number, number, number];
  reason?: string;
  phraseStep?: number;
  plantProfile?: string;
  plantTempoScene?: string;
  plantEpoch?: number;
  packetCadenceMs?: number;
  packetTempoChange?: number;
};
export type Expression = {
  brightness: number;
  energy: number;
  direction: number;
  bands: number[];
  space?: number;
  smoothing?: number;
};
export type ChannelMix = {
  level: number;
  delay: Patch['delay'];
  reverb: Patch['reverb'];
  chorus: Patch['chorus'];
  smoothing: number;
};
export type Event =
  | { type: 'expression'; time: number; expression: Expression }
  | { type: 'mix'; time: number; slot: string; mix: ChannelMix }
  | { type: 'note'; time: number; note: Note }
  | { type: 'release'; time: number; lane?: Lane; slot?: string };
export type Soundscape = {
  duration: number;
  config: Configuration;
  events: Event[];
  notes: Note[];
};
