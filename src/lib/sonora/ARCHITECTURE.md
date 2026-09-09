# Moods, rules and plant expression

- `presets.ts`: sound choices and user-owned settings. `mood` and `plantResponse`
  are additive configuration fields; old saved configurations default to Organic.
- `moods.ts`: JSON-compatible mood definitions, suggested sounds and bounded
  modulation ranges. Organic is the first entry, not a collection of renamed sounds.
- `intent.ts`: real frames become musical intent. Signal statistics and touch
  detection run only on packets, not on musical ticks.
- `rules/`: strategies implement `MusicalRules`. Organic contains the existing
  motif/layer vocabulary. Add a strategy and register its factory in `rules/index.ts`,
  then add a mood pointing to its rule key in `moods.ts`. No audio backend changes.
- `composer.ts`: lifecycle and clock. `push(frame)` updates intent; `advance(time)`
  executes the next due step using the latest intent. It never catches up missed
  notes in a burst. Six seconds without data release the music and clear intent.
  Note IDs remain unique across strategy changes and reconnect gaps.
- `modulation.ts`: bounded expression from the latest intent and mood. User patches
  are never overwritten. The response control scales timbre/space modulation, not
  the plant's role in pitch and rhythm. Zero returns modulation to neutral smoothly.
- `dsp.ts` and `modules/plantia-pcm/cpp/Sonora.h`: matching audio backends. Expression
  is smoothed in the audio loop (default 400 ms). Space changes reverb by at most
  eight percentage points and delay by four in Organic; disabled effects stay off.
  No configuration calls or sample reloads are needed for plant modulation.

The same independent synth/instrument scales remain available. The mood selector
does not replace customized patches with its suggested sounds.

## Percussion

`Preset.percussion` lists unpitched strike IDs, not musical scale notes. `notePool`
returns these strikes, and sample playback preserves their original speed. Bongos,
congas, timbales and maracas hide irrelevant tuning/register controls. Taiko,
timpani and kalimba remain pitched presets. All use the existing sample bank and
note protocol. The greeting uses a three-strike response for unpitched instruments.

`scripts/import-percussion.mjs` reproduces the small sample subset. The manifest
records the upstream revision, URLs, byte sizes and hashes; attribution lives next
to the audio files. Run `npm run sonora:build` after changing presets or samples.

## Master output

Both DSP backends use 4.125 pre-limiter gain (previously 1.65), a 2.5x increase.
The existing tanh limiter bounds PCM to +/-0.9; peak limiting means the output is
not always exactly 2.5x. This is not a claim of 2.5x perceived loudness. No automatic
gain boosts are applied during silence. Start device listening checks at low volume.
