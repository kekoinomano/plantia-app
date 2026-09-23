import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { loadEngine, replay, render } from './lib/wave-replay.mjs';
const args = process.argv.slice(2);
const label = args.includes('--label') ? args[args.indexOf('--label') + 1] : 'current';
const out = resolve('output/lofi', label);
await mkdir(out, { recursive: true });
const engine = await loadEngine();
const reports = [];
const quantiles = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return [.05, .5, .95].map(q => sorted[Math.floor((sorted.length - 1) * q)] ?? null);
};
const fileArg = args.indexOf('--file');
if (fileArg >= 0 && (!args[fileArg + 1] || args[fileArg + 1].startsWith('--'))) throw Error('--file requires a recording path');
const files = fileArg >= 0 ? [resolve(args[fileArg + 1])]
  : (await readdir('datasamples')).filter(name => name.endsWith('.json')).sort().map(name => resolve('datasamples', name));
for (const input of files) {
  const file = basename(input);
  const raw = await readFile(input, 'utf8'), recording = JSON.parse(raw);
  const began = performance.now();
  const score = await replay(engine, recording);
  const metrics = { file, name: recording.session.name, sha256: createHash('sha256').update(raw).digest('hex'),
    duration: score.duration, packets: recording.packets.length, frames: score.frames.length, bars: score.bars.length,
    firstNote: score.notes[0]?.time, notes: score.notes.length, computeWallMs: performance.now() - began,
    ranges: Object.fromEntries(['mean', 'relative', 'speed', 'width', 'concentration', 'centroid'].map(key => [key, quantiles(score.frames.map(frame => {
      const f = engine.musicalFeatures(frame.short, frame.long), identity = engine.signalIdentity(frame.long);
      return key === 'mean' ? frame.long.fit.mean : key === 'width' ? identity.width : key === 'concentration' ? frame.short.concentration : key === 'centroid' ? frame.long.centroid : f[key];
    }))])),
    bpm: quantiles(score.bars.map(bar => bar.bpm)),
    scenes: [...new Set(score.bars.map(bar => bar.summary.scene ?? bar.summary.style))],
    greetingEvents: score.notes.filter(n => n.reason?.startsWith('Saludo')).length,
    attacksPerBar: quantiles(score.bars.map(bar => bar.notes.length)),
  };
  await writeFile(`${out}/${file}`, JSON.stringify({ metrics, frames: score.frames, bars: score.bars, notes: score.notes.map(({wave,patch,...n})=>({...n,preset:patch.preset,analysis:wave?.analysis})) }));
  if (args.includes('--render')) metrics.audio = await render(engine, score, `${out}/${file.replace('.json','.mp3')}`);
  reports.push(metrics); console.log(JSON.stringify(metrics));
}
await writeFile(`${out}/summary.json`, JSON.stringify(reports, null, 2));
