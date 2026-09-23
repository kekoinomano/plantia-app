import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { loadEngine, replay, render } from './lib/wave-replay.mjs';

// Auditions only: change articulation over ONE replay, without changing the
// production mood or the backing events. No cross-chord melody tails.
const input = resolve(process.argv[2] ?? 'datasamples/suegra2.json');
const out = resolve('output/lofi/phrasing-comparison');
await mkdir(out, { recursive: true });
const engine = await loadEngine();
const score = await replay(engine, JSON.parse(await readFile(input, 'utf8')));
const solo = n => n.slot === 'contour' || n.slot === 'detail';
const options = [
  { name: '01-arpa-enlazada', preset: 'harp', attack: 10, release: 27,
    description: 'Arpa: frase continua, caídas ligeramente solapadas, última nota más suave.',
    positions: count => count === 2 ? [.5, 1.75] : [.5, 1.35, 2.2], overlap: .1, lastBeats: 1.35 },
  { name: '02-guitarra-espaciada', preset: 'guitar', attack: 12, release: 30,
    description: 'Guitarra: una sola nota por compás melódico, sostenida y con una caída larga.',
    positions: () => [1], overlap: 0, lastBeats: 2.1, sparse: true },
  { name: '03-guitarra-con-acorde', preset: 'guitar', attack: 8, release: 23,
    description: 'Guitarra: la frase nace con el acorde, desarrolla dos o tres notas y deja libre el final.',
    positions: count => count === 2 ? [0, 1] : [0, .75, 1.5], overlap: .04, lastBeats: .95 },
  { name: '04-arpa-respuesta', preset: 'harp', attack: 10, release: 25,
    description: 'Arpa: dos notas después de retirarse la base, como una respuesta y no encima de ella.',
    positions: () => [2.2, 3], overlap: .08, lastBeats: .65, response: true },
];
const backing = score.events.filter(e => e.type !== 'note' || !solo(e.note));
const reports = [];
for (const option of options) {
  const variant = structuredClone(score);
  variant.events = structuredClone(backing);
  const additions = [];
  for (const [index, bar] of score.bars.entries()) {
    const beat = 60 / bar.bpm;
    const end = Math.min(score.bars[index + 1]?.time ?? bar.time + beat * 4, score.duration) - .08;
    const original = score.notes.filter(n => solo(n) && n.time >= bar.time - .001 && n.time < bar.time + beat * 4 - .001);
    if (!original.length) continue;
    const selected = option.sparse ? [original.at(-1)] : option.response ? [original[0], original.at(-1)] : original;
    const positions = option.positions(selected.length);
    if (option.response) {
      const baseEnd = Math.max(bar.time, ...score.notes.filter(n => n.slot === 'foundation' && n.time >= bar.time - .001 && n.time < bar.time + .1)
        .map(n => n.time + n.duration + .06 + 3.5 * (n.patch.envelope.release / 100) ** 2));
      positions[0] = Math.max(positions[0], (baseEnd + .12 - bar.time) / beat);
      positions[1] = Math.max(positions[1], positions[0] + .65);
    }
    for (const [i, originalNote] of selected.entries()) {
      const note = structuredClone(originalNote);
      note.time = bar.time + positions[i] * beat;
      const release = .06 + 3.5 * (option.release / 100) ** 2;
      const next = i + 1 < selected.length ? bar.time + positions[i + 1] * beat : null;
      const tailEnd = Math.min(end, next === null ? note.time + option.lastBeats * beat + release : next + option.overlap);
      note.duration = tailEnd - note.time - release;
      if (note.duration < .1) continue;
      note.patch.preset = option.preset;
      note.patch.envelope = { on: true, attack: option.attack, release: option.release };
      note.velocity = Math.max(1, note.velocity - 3 - (i === selected.length - 1 ? 3 : 0));
      note.reason = option.description;
      if (note.wave) {
        note.wave.musicalStep = positions[i] * 4;
        note.wave.rule = option.description;
        note.wave.mapping = 'audition-phrasing-over-wave-derived-pitches';
      }
      additions.push({ type: 'note', time: note.time, note });
    }
  }
  variant.events.push(...additions);
  variant.events.sort((a, b) => a.time - b.time);
  variant.notes = variant.events.filter(e => e.type === 'note').map(e => e.note);
  assert.deepEqual(variant.notes.filter(n => !solo(n)), score.notes.filter(n => !solo(n)));
  assert.ok(additions.length > 0);
  const audio = await render(engine, variant, `${out}/${option.name}.mp3`);
  assert.ok(audio.invalid === 0 && audio.peak < 1);
  reports.push({ ...option, positions: undefined, input, soloNotes: additions.length, audio,
    notes: additions.map(({ note: n }) => ({ time: n.time, midi: n.midi, duration: n.duration, velocity: n.velocity })) });
  console.log(`${option.name}: ${additions.length} solo notes, peak=${audio.peak.toFixed(3)}`);
}
await writeFile(`${out}/summary.json`, JSON.stringify(reports, null, 2));
