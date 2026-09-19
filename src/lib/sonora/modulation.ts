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
  const brightness = c.level * 0.16 + intent.shape * 0.2 + intent.fingerprint.entropy * 0.24 +
    intent.history.range * 0.2 + intent.history.microChange * 0.2;
  const energy = intent.history.volatility * 0.22 + intent.history.burst * 0.18 +
    intent.history.microChange * 0.28 + intent.history.turn * 0.16 +
    (1 - intent.fingerprint.cadence) * 0.08 + intent.fingerprint.novelty * 0.08;
  return {
    brightness: clamp(0.35 + clamp(brightness - 0.35, -ranges.brightness, ranges.brightness) * amount),
    energy: clamp(0.3 + clamp(energy - 0.3, -ranges.energy, ranges.energy) * amount),
    direction: Math.tanh(frame.slope / profileScale) * amount,
    bands: bands.map((x) => 0.33 + (x - 0.33) * amount),
    space: clamp(intent.history.recurrence - intent.history.volatility * 0.55 -
      intent.fingerprint.irregularity * 0.35, -1, 1) * ranges.space * amount,
    smoothing: ranges.smoothing,
  };
}
