import { WAVE_MOODS, waveMood } from '../wave-music/registry';
export type ProfileId = 'deep-focus' | 'sleep' | 'psychedelic' | 'ghibli' | 'lofi-waves' | 'space' | 'smooth-techno' | 'jazz-session';
export type ListeningProfile = {
  id: ProfileId; name: string; description: string;
  notes: readonly number[]; tuning: number;
  /** Optional reference pitch class; other moods retain the sensor-selected centre. */
  tonic?: number;
  leadRange: readonly [number, number]; detailRange: readonly [number, number];
  space: number; width: number; tension: number;
  lead: readonly string[]; detail: readonly string[]; body: readonly string[];
  phrase: {
    notes: readonly [number, number]; spacing: readonly [number, number];
    rest: readonly [number, number]; gate: readonly [number, number];
    attacksPerMinute: number; answerEvery: number; salience: number;
    beat: number; swing: number;
  };
  harmony: { chords: readonly (readonly number[])[]; hold: number; fade: number; voices: number };
  mix: { body: number; lead: number; detail: number; velocity: number; brightness: number };
};
export const PROFILES: readonly ListeningProfile[] = WAVE_MOODS.map(mood => mood.profile);
export const profile = (id?: string): ListeningProfile =>
  PROFILES.find(p => p.id === (id === 'lofi' ? 'lofi-waves' : id)) ?? PROFILES[0];
export const FOCUS = profile('deep-focus');
export const palettePresets = (id?: string) => [...waveMood(profile(id).id)!.presets];
