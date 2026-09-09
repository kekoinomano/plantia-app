import { OrganicRules } from './organic.ts';
import { EnsembleRules } from './ensemble.ts';
import { mood } from '../moods.ts';
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
const factories = {
  organic: (config: Configuration): MusicalRules => new OrganicRules(config),
  mist: (config: Configuration): MusicalRules => new EnsembleRules(config, 'mist'),
  grove: (config: Configuration): MusicalRules => new EnsembleRules(config, 'grove'),
};
export const createRules = (config: Configuration): MusicalRules => factories[mood(config.mood).rules](config);
