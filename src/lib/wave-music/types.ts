import type { ListeningProfile } from '../sonora/focus';
import type { EnsemblePlan } from '../sonora/orchestration';
import type { Patch } from '../sonora/presets';
import type { Expression } from '../sonora/music-types';
import type { RawGreeting } from './greeting';
import type { WaveFrame } from './features';

export type WaveNote = {
  step: number; slot: string; preset: string; midi: number; velocity: number;
  beats: number; offset?: number; pan: number; color: number;
  attack: number; release: number; rule: string; window: 'short' | 'long'; components: number[];
  /** A retained motif must point to its original analysis, not today's frame. */
  sourceFrame?: WaveFrame;
};
export type WaveBar = {
  bpm: number; beats: number; stepsPerBeat: number; swing: number;
  swingUnit?: number;
  notes: WaveNote[]; expression: Expression;
  summary: Record<string, unknown>;
};
export type GreetingPhrase = { holdSeconds: number; notes: {
  after: number; duration: number; slot: string; preset: string; midi: number; velocity: number;
  color: number; pan: number; attack: number; release: number; rule: string;
}[] };
export type WaveMood = {
  profile: ListeningProfile; ensemble: EnsemblePlan; explanation: readonly string[];
  presets: readonly string[];
  patch: (preset: string, slot: string) => Patch;
  create: () => { arrange: (frame: WaveFrame) => WaveBar; reset: () => void; greet?: (event: RawGreeting) => GreetingPhrase };
};
