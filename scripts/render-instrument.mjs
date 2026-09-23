// Render isolated notes through the existing sample engine, dry and with its patch.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const id = process.argv[2] ?? 'pianoforte';
const directory = resolve(process.argv[3] ?? 'inspiration/analysis/ReelAudio-49821');
const { outputFiles } = await build({ stdin: { contents: `
export { synthesize, encodeWav } from './src/lib/sonora/dsp.ts';
export { defaultConfiguration, preset, copyPatch } from './src/lib/sonora/presets.ts';
`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node' });
const engine = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const definition = engine.preset(id);
if (definition.id !== id || !definition.program) throw Error('Choose a registered sampled instrument.');
const manifest = JSON.parse(await readFile('assets/audio/sonora/manifest.json', 'utf8'));
const sampleRate = 48000;
const bank = { [definition.program]: manifest.programs[definition.program].map(entry => {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-i', resolve('assets/audio/sonora', entry.file),
    '-f', 'f32le', '-ac', '1', '-ar', String(sampleRate), 'pipe:1'], { maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw Error(result.error?.message ?? result.stderr.toString());
  const mono = new Float32Array(Uint8Array.from(result.stdout).buffer);
  // Match SampleBank's runtime trimming and peak normalization.
  let peak = 0, start = 0;
  for (const value of mono) peak = Math.max(peak, Math.abs(value));
  while (start < mono.length && Math.abs(mono[start]) < peak * .004) start++;
  const data = mono.slice(Math.max(0, start - 32));
  if (peak > .001) for (let n = 0; n < data.length; n++) data[n] *= .85 / peak;
  return { midi: entry.midi, rate: sampleRate, data };
}) };
await mkdir(directory, { recursive: true });
for (const dry of [true, false]) {
  const patch = engine.copyPatch(id);
  if (dry) { patch.reverb.on = false; patch.delay.on = false; patch.chorus.on = false; }
  const config = { ...engine.defaultConfiguration(), instrument: patch,
    slots: [{ id: 'contour', kind: 'instrument', patch, level: .42 }] };
  const notes = [60, 62, 65, 67, 70].map((midi, index) => ({ id: index, time: .3 + index * 2.4,
    sourceTime: 0, source: index, midi, velocity: 65, duration: 2.3,
    lane: 'instrument', slot: 'contour', patch, color: .2, pan: 0, reason: 'isolated-timbre-audition' }));
  const events = notes.map(note => ({ type: 'note', time: note.time, note }));
  const pcm = await engine.synthesize({ duration: 12.2, config, notes, events }, bank, sampleRate);
  const file = resolve(directory, `${id}-${dry ? 'dry' : 'room'}.mp3`);
  const result = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', '256k', file],
    { input: Buffer.from(engine.encodeWav(pcm)), maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw Error(result.error?.message ?? result.stderr.toString());
  await writeFile(`${file}.json`, JSON.stringify({ instrument: id, dry, sampleRate,
    notes: notes.map(({ time, midi }) => ({ time, midi })), source: 'Original generated sample bank, actual AudioCore' }, null, 2));
  console.log(file);
}
