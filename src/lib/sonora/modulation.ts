import { clamp } from './signal.ts';
import { mood } from './moods.ts';
import type { Configuration } from './presets.ts';
import type { MusicalIntent } from './intent.ts';
import type { Expression } from './music-types.ts';

/** Bounded transient expression, separate from the user's saved knobs. */
export function plantExpression(intent: MusicalIntent, config: Configuration): Expression {
  const { character: c, bands, frame, profileScale } = intent;
  const ranges = mood(config.mood).modulation;
  const amount = config.plantResponse ?? 1;
  const ensemble = mood(config.mood).rules !== 'organic';
  const brightness = ensemble ? c.level * 0.25 + intent.shape * 0.35 + intent.fingerprint.entropy * 0.4 : c.texture * 0.35 + c.level * 0.2 + c.variation * 0.25 +
    bands.slice(4).reduce((sum, x) => sum + x, 0) * 0.08;
  const energy = ensemble ? c.variation * 0.4 + (1 - intent.fingerprint.cadence) * 0.35 + intent.fingerprint.novelty * 0.25 : c.variation * 0.4 + c.pace * 0.3 + c.texture * 0.3;
  return {
    brightness: clamp(0.35 + clamp(brightness - 0.35, -ranges.brightness, ranges.brightness) * amount),
    energy: clamp(0.3 + clamp(energy - 0.3, -ranges.energy, ranges.energy) * amount),
    direction: Math.tanh(frame.slope / profileScale) * amount,
    bands: bands.map((x) => 0.33 + (x - 0.33) * amount),
    space: clamp(ensemble ? 1 - intent.fingerprint.cadence - c.texture - intent.fingerprint.irregularity * 0.5 : (c.variation - 0.5) * 2, -1, 1) * ranges.space * amount,
    smoothing: ranges.smoothing,
  };
}
