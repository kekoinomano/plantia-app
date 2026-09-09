# Moods, rules and plant expression

For the detailed Spanish musical specification, formulas, current limitations and
agent extension guide, see [SOUND_BIBLE.md](../../../SOUND_BIBLE.md). Keep it in
sync when changing a mood. This file is the short architecture overview.

- `presets.ts`: sound choices and user-owned settings. `slots` is the canonical
  sound layout: stable ID, kind, patch, level and optional synth motion per slot.
  Old two-voice settings migrate into Organic's atmosphere/melody slots. Legacy
  synth/instrument fields remain compatibility views for Organic, not extra voices.
- `moods.ts`: JSON-compatible directors with slots, allowed families, default
  sounds and modulation ranges. Organic: atmosphere + melody. Bruma: one atmosphere.
  Sotobosque: atmosphere + percussion + wind, with signal-shaped 12/16-step phrases.
- `intent.ts`: real frames become musical intent. Signal statistics and touch
  detection run only on packets, not on musical ticks.
  Ensemble fingerprints include logarithmic packet cadence, cadence irregularity,
  normalized DCT entropy, sample-order asymmetry and inter-frame novelty. These
  describe the measured signal, not calibrated audio frequencies or plant emotions.
- `rules/`: strategies implement `MusicalRules`. Organic contains the existing
  motif/layer vocabulary. Add a strategy and register its factory in `rules/index.ts`,
  then add a mood pointing to its rule key in `moods.ts`. No audio backend changes.
  `ensemble.ts` captures motifs at phrase boundaries, preserves their opening and
  varies their endings. Bruma uses consonant two/three-voice clouds with voice
  leading, staggered attacks, solo answers and shorter phrase endings. Sotobosque
  distributes percussion pulses across 12/16 cells, adds sparse seven-cell ghost
  accents with activity, and answers with inverted/reversed wind motifs. Two final
  wind cells are rests; gates and transient envelope releases leave breathing room
  (user-enabled delay/reverb may still ring). Pitch and chords stay inside each
  slot's chosen notes/octaves; unpitched percussion keeps its original strike IDs.
  No random generator or packet-sequence hash replaces signal features. The clock
  develops phrases between real packets; it does not invent new measurements.
- `composer.ts`: lifecycle and clock. `push(frame)` updates intent; `advance(time)`
  executes the next due step using the latest intent. It never catches up missed
  notes in a burst. Six seconds without data release the music and clear intent.
  Note IDs remain unique across strategy changes and reconnect gaps.
- `modulation.ts`: bounded expression from the latest intent and mood. User patches
  are never overwritten. The response control scales timbre/space modulation and
  the ensemble home-register offset, not all plant-driven pitch/rhythm/articulation.
  Zero returns continuous expression to neutral smoothly.
- `dsp.ts` and `modules/plantia-pcm/cpp/Sonora.h`: matching audio backends. Expression
  is smoothed in the audio loop (default 400 ms). Space changes reverb by at most
  eight percentage points and delay by four in Organic; disabled effects stay off.
  No configuration calls or sample reloads are needed for plant modulation.

Each slot has its own effects bus, level, voices and (when pitched) scale. The
sample bank loads the union of required programs, sharing identical samples in RAM.
Native channel indices are transport details; notes/releases use stable slot IDs.
Changing layout clears old voices, pending events and effect tails without resetting
the audio clock. Up to eight sound slots plus a dedicated greeting bus are supported
as a real-time resource budget. Mixing and the master limiter remain shared.

The home screen presents the mood first and compact slot editors below. Both UI
filtering and configuration validation enforce slot families. Returning to a mood
restores its edits during the current session; this does not add disk persistence.
Patch memories are keyed by mood, slot and preset, so two copies of a sound can
be edited independently. A new mood starts with its own defaults.

To add a mood using an existing strategy, add its slot definitions to `moods.ts`.
For new musical behavior, implement `MusicalRules` and register the factory. A rule
emits notes with `slot` (routing) and `lane` (synth/instrument/greeting sound kind).
No new editor, sample loader or native bus code is required for additional slots
within the resource budget. New instrument families belong in preset metadata.

## Percussion

`Preset.percussion` lists unpitched strike IDs, not musical scale notes. `notePool`
returns these strikes, and sample playback preserves their original speed. Bongos,
congas, timbales and maracas hide irrelevant tuning/register controls. Taiko,
timpani and kalimba remain pitched presets. All use the existing sample bank and
note protocol. The greeting uses a three-strike response for unpitched instruments.

`scripts/import-percussion.mjs` reproduces the small sample subset. The manifest
records the upstream revision, URLs, byte sizes and hashes; attribution lives next
to the audio files. Run `npm run sonora:build` after changing presets or samples.

## Additional winds

`scripts/import-winds.mjs` imports 15 MP3s (three registers per sound) for
shakuhachi, ocarina, recorder, shanai and blown bottle from the same pinned,
CC-BY-3.0 FluidR3 bank. These are soundfont approximations, not field recordings.
Only selected programs are decoded in memory; the files add approximately 360 KiB.

## Master output

Both DSP backends use 4.125 pre-limiter gain (previously 1.65), a 2.5x increase.
The existing tanh limiter bounds PCM to +/-0.9; peak limiting means the output is
not always exactly 2.5x. This is not a claim of 2.5x perceived loudness. No automatic
gain boosts are applied during silence. Start device listening checks at low volume.
