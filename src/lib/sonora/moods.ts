/** Serializable mood catalogue. Sound choices are suggestions, never forced on edits. */
export type Mood = {
  id: string;
  name: string;
  rules: 'organic';
  sounds: { synth: string; instrument: string };
  modulation: { brightness: number; energy: number; space: number; smoothing: number };
};
export const MOODS: readonly Mood[] = [{
  id: 'organic', name: 'Orgánico', rules: 'organic',
  sounds: { synth: 'healing', instrument: 'harp' },
  modulation: { brightness: 0.3, energy: 0.25, space: 8, smoothing: 0.4 },
}];
export const mood = (id?: string): Mood => MOODS.find((m) => m.id === id) ?? MOODS[0];
