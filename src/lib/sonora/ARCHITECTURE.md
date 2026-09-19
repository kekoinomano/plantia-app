# Mood-owned orchestra

For the detailed Spanish musical specification, see
[SOUND_BIBLE.md](../../../SOUND_BIBLE.md). This file is the short implementation map.

## Ownership model

Every mood, including Organic, is a complete score interpreted by `OrchestraRules`.
A preset is only raw timbre. The mood owns orchestration, role, register, rhythm,
rests, harmony progression, articulation and all effect automation.

The user can change only:

- one scale and tuning shared by every pitched voice;
- the volume of each visible mood slot;
- the preset of an instrument slot, restricted to the families declared by its role.

Synth presets cannot be replaced. Per-slot scales, octaves, envelopes, motion and
effect settings no longer exist in `Configuration`. `sanitizeConfiguration` rebuilds
every effective patch from the mood so stale UI or saved patch data cannot override
the score.

## Main files

- `moods.ts`: scores, harmony defaults, progressions, slots, roles, registers and
  default timbres for Organic, Sereno, Deriva, Prisma and Ritual.
- `presets.ts`: raw timbre catalogue plus the reduced v2 configuration. `soundSlots`
  combines mood-owned patches with user-owned harmony, levels and compatible
  instrument choices.
- `signal.ts`: packet validation, ten-packet arrival-speed window and robust regime
  change detection before musical frame aggregation.
- `intent.ts`: bounded interpretation of live plant frames and recent history.
- `rules/orchestra.ts`: the only conductor. Its style branches define the musical
  grammar for all moods.
- `composer.ts`: lifecycle and musical clock. It never catches up missed notes in a
  burst; a data gap releases the orchestra.
- `modulation.ts`: continuous, bounded plant expression independent of discrete
  notes and score decisions.
- `dsp.ts` and `modules/plantia-pcm/cpp/Sonora.h`: equivalent JS/native renderers.

## Active moods

| Mood | Orchestra | Default harmony | Identity |
| --- | --- | --- | --- |
| Orgánico | Meadow + Harp and hidden Pan Flute | C major pentatonic, 432 Hz | Warm foundation, evolving harp and plant-invited colour. |
| Sereno | Meadow, Peace, Harp and Shakuhachi | C major pentatonic, 432 Hz | Warm beds, varied sustained harp gestures and sparse wind response. |
| Deriva | Space Time, Mandala, Crystal, Tibetan Bell | C Lydian, 440 Hz | Mostly synthetic field with rare punctuation. |
| Prisma | Velvet, Prism Dust, Beauty, Sitar | C Dorian, 432 Hz | Stable modal pitch, polymetric harmony and slow stereo colour. |
| Ritual | Meditation, Congas, Shakuhachi and Kalimba | C minor pentatonic, 440 Hz | Euclidean earth pulse and wind call/response. |

Unpitched percussion keeps original sample IDs; it is the sole pitch exception.

## Notes, gestures and effects

The conductor works in 16-cell phrases. It listens for about twelve musical
observations, then locks both a content profile and one of four absolute cadence
scenes: cascade (<40 ms/packet), ripples (<140 ms), lyrical (<350 ms) or stillness.
This listening phase is not silent: a safe opening starts on the first frame, and
the calibrated identity takes over without restarting playback.
These scenes do not share one melody at different speeds: they have different entry
maps, voice counts, chord/arpeggio/line grammar, sustain and silence. Inside one
scene, phrase variants alter entry positions, register targets, contour and the mix
of solos, dyads, triads and four-note chords. A confirmed
packet-speed regime change opens a new arrangement epoch, restarts the phrase and
introduces a transformation chord plus a characteristic optional player. If the
change coincides with a greeting, the new scene enters immediately after it. An 18-second
hysteresis prevents repeated transformations around one boundary; live readings
continue to drive gestures inside each stable epoch.
Root progressions and short voice-leading keep parts harmonically related. Melodies
use a bounded register, stepwise movement, gravity toward their center and
chord-tone resolution. Sereno's harp has a lower upper bound so it cannot repeatedly
climb to its driest, highest samples.

`mix` events control level, delay, reverb and chorus for one stable slot. Raw preset
effect values are discarded before a channel is created, preventing legacy values
such as 84% chorus or 100% delay from leaking into a mood. There are
two automation scales:

1. A slow four-cell mix establishes each phrase's depth and energy arc.
2. Every emitted live gesture creates another mix target from its role, reason,
   articulation and current signal. Nearby notes in one rolled chord share that
   target, avoiding rapid bus movement.

Organic and Sereno instruments use no explicit delay; their continuity comes from
long gates, releases and a dark, eight-line diffusion reverb. The current ambient
scores keep explicit delay disabled. The reverb's short reflections are kept far
below its late field so transients do not become slap echoes.

The envelope is rebuilt per note, so attack and release are not fixed across an
instrument. Slot buses retain their histories and interpolate targets rather than
resetting tails. `[Plantia Music]` logs each `SCORE` batch with notes and the mix
targets generated for them. Notes also report `plantProfile`, `plantEpoch`,
`plantTempoScene`, `packetCadenceMs` and `packetTempoChange`, making arrangement identity and confirmed
packet-speed transitions observable.

The score contains no downloaded nature recordings. Packet timestamps are mapped
onto the audio clock with one constant offset, preserving their original intervals;
there is no random source in signal analysis or composition. Identical packets,
timestamps, configuration and engine version therefore produce the same score.

## Extending the system

Add the complete orchestra and score to `moods.ts`, then add a style branch to
`OrchestraRules` only if its grammar is genuinely different. Do not expose raw
patch controls. Keep all slots within the shared harmony and give each one a clear
register and function.

Run `npm run sonora:build` after executable Sonora changes. It regenerates
`src/lib/audio/sonora-runtime.ts`; never edit that file manually.

Default sample programs are decoded in the background and retained by `SampleBank`.
On a mood change the old PCM reserve is discarded and the new score is faded in,
so neither a stale 1.2-second queue nor repeated decoding delays the transition.
