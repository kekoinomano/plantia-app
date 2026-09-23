import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEngine, replay, render } from './lib/wave-replay.mjs';

// Replay once: identical pitches, timing, velocities, backing and effects.
// Only the foreground instrument and its onset envelope change.
const input = resolve(process.argv[2] ?? 'datasamples/suegra2.json');
const out = resolve('output/lofi/solo-comparison');
await mkdir(out, { recursive: true });
const engine = await loadEngine();
const score = await replay(engine, JSON.parse(await readFile(input, 'utf8')));
const foreground = slot => ['contour', 'detail', 'counter'].includes(slot);
const reports = [];
for (const [preset, attack, name] of [
  ['harp', 8, '01-arpa'],
  ['guitar', 10, '02-guitarra-nylon'],
  ['electric-piano', 18, '03-piano-electrico'],
  ['pan-flute', 30, '04-flauta-pan'],
]) {
  const variant = structuredClone(score);
  const patch = p => ({ ...p, preset, envelope: { ...p.envelope, attack } });
  for (const slot of variant.config.slots ?? []) {
    if (foreground(slot.id)) slot.patch = patch(slot.patch);
  }
  for (const event of variant.events) {
    if (event.type === 'note' && foreground(event.note.slot)) event.note.patch = patch(event.note.patch);
  }
  variant.notes = variant.events.filter(e => e.type === 'note').map(e => e.note);
  const audio = await render(engine, variant, `${out}/${name}.mp3`);
  if (audio.invalid || audio.peak >= 1) throw Error(`Invalid audio: ${name}`);
  reports.push({ input, preset, attack, file: `${name}.mp3`, audio });
  console.log(`${name}: peak=${audio.peak.toFixed(3)}, invalid=${audio.invalid}`);
}
await writeFile(`${out}/summary.json`, JSON.stringify(reports, null, 2));
