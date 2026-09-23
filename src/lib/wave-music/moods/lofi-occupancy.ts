import type { WaveNote } from '../types';

const foreground = (note: WaveNote) => note.slot === 'contour' || note.slot === 'detail';

/** Final musical admission pass. Gates include the renderer's instrumental
 * release upper bound; sample EOF can shorten it. Reverb is not counted as a
 * pitched voice, so this is a score schedule, not a measurement of PCM silence. */
export function orchestrateLofi(input: readonly WaveNote[], bpm: number, swing: number, options: { allowHarmonyUnderLead?: boolean; preserveArticulation?: boolean } = {}) {
  const beat = 60 / bpm;
  const onset = (note: WaveNote) => (note.step / 4 + (Math.floor(note.step / 2) % 2 ? swing / 2 : 0)) * beat + (note.offset ?? 0);
  const tail = (note: WaveNote) => note.slot === 'percussion' ? 0.025 : note.slot === 'bass' ? 0.12
    : 0.06 + 3.5 * (note.release / 100) ** 2;
  const notes = input.map(note => ({ ...note }));
  const solo = notes.filter(foreground).sort((a, b) => onset(a) - onset(b));
  const barEnd = 4 * beat - 0.08;
  const accepted = new Set<WaveNote>();
  let shortened = 0;
  const admit = (note: WaveNote, end: number) => {
    const available = end - onset(note) - tail(note);
    if (available < 0.09) return;
    const duration = Math.min(note.beats * beat, available);
    if (duration < note.beats * beat - 0.001) shortened++;
    note.beats = duration / beat;
    accepted.add(note);
  };
  solo.forEach((note, i) => {
    if (!options.preserveArticulation) note.release = 12;
    // One foreground voice at a time, including its release and a 90 ms breath.
    admit(note, Math.min(barEnd, solo[i + 1] ? onset(solo[i + 1]) - 0.09 : barEnd));
  });
  const firstSolo = solo.find(note => accepted.has(note));
  for (const note of notes) {
    if (foreground(note)) continue;
    if (note.slot === 'foundation') {
      if (!options.preserveArticulation) note.release = firstSolo ? 16 : 25;
      admit(note, firstSolo && !options.allowHarmonyUnderLead ? Math.min(barEnd, onset(firstSolo) - 0.12) : barEnd);
    } else if (note.slot === 'bass') {
      const next = notes.filter(other => other.slot === 'bass' && onset(other) > onset(note))
        .sort((a, b) => onset(a) - onset(b))[0];
      admit(note, Math.min(barEnd, next ? onset(next) - 0.06 : barEnd));
    } else {
      // Avoid a bright hat masking the articulation of the lead. Backbeats and
      // low kick/bass support may overlap; they have different musical roles.
      const touchesSolo = solo.some(other => accepted.has(other) && Math.abs(onset(other) - onset(note)) < 0.12);
      if (touchesSolo && note.preset === 'soft-hat') continue;
      if (touchesSolo && note.preset === 'brush-snare') note.velocity *= 0.8;
      admit(note, barEnd);
    }
  }
  const result = notes.filter(note => accepted.has(note)).sort((a, b) => onset(a) - onset(b));
  const schedule = result.filter(note => note.slot !== 'percussion').map(note => ({
    slot: note.slot, midi: note.midi, startBeat: onset(note) / beat,
    gateEndBeat: onset(note) / beat + note.beats,
    endBeat: (onset(note) + note.beats * beat + tail(note)) / beat,
  }));
  const edges = schedule.flatMap(note => [{ at: note.startBeat, delta: 1 }, { at: note.endBeat, delta: -1 }])
    .sort((a, b) => a.at - b.at || a.delta - b.delta);
  let active = 0, peak = 0;
  for (const edge of edges) { active += edge.delta; peak = Math.max(peak, active); }
  return { notes: result, schedule, peakPitchedVoices: peak, shortened, omitted: input.length - result.length };
}
