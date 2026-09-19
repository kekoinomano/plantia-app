import { OrchestraRules } from './orchestra.ts';
import type { Configuration } from '../presets.ts';
import type { Frame } from '../signal.ts';
import type { MusicalIntent } from '../intent.ts';
import type { Event, Lane } from '../music-types.ts';

/** Strategies emit the same protocol; DSP, Bluetooth and sample loading stay shared. */
export interface MusicalRules {
  configure(config: Configuration, time: number): void;
  tick(intent: MusicalIntent, time: number): void;
  greet(frame: Frame): void;
  audition(lane: Lane, time: number, slotId?: string): void;
  finish(time: number): void;
  drain(): Event[];
}
export const createRules = (config: Configuration): MusicalRules => new OrchestraRules(config);
