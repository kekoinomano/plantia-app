import { waveMood } from '../wave-music/registry';
import { profile } from './focus';
export type EnsemblePlan = {
  base: 'drone' | 'jazz' | 'chamber' | 'pulse'; foundationKind: 'synth' | 'instrument'; textureKind: 'synth' | 'instrument';
  accompaniment: readonly string[]; bass: readonly string[]; texture: readonly string[];
  tempo: readonly [number, number]; meter: number; budget: number;
  levels: { accompaniment: number; bass: number; texture: number; percussion: number };
};
export const ensemblePlan = (id?: string): EnsemblePlan => waveMood(profile(id).id)!.ensemble;
