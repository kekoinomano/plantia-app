import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export async function loadEngine() {
  const { outputFiles } = await build({ stdin: { contents: `
export { WAVE_MOODS, waveMood } from './src/lib/wave-music/registry';
export { WaveComposer } from './src/lib/wave-music/composer';
export { lofiWaves, makeLofiMood } from './src/lib/wave-music/moods/lofi';
export { GreetingDetector } from './src/lib/wave-music/greeting';
export { musicalFeatures, signalIdentity } from './src/lib/wave-music/musical-field';
export { sanitizeConfiguration, preset } from './src/lib/sonora/presets';
export { synthesize, encodeWav, prepareVoice } from './src/lib/sonora/dsp';
`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node', target: 'node22' });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
}
export const compactFrame = frame => ({ ...frame, short: compactWindow(frame.short), long: compactWindow(frame.long) });
function compactWindow(window) {
  const { times, observed, fitted, ...fit } = window.fit;
  const compactWave = ({ values, ...wave }) => wave;
  return { ...window, waves: window.waves.map(compactWave), fit: { ...fit, waves: fit.waves.map(compactWave) } };
}
export async function replay(engine, recording, { tail = 1, mood = engine.lofiWaves } = {}) {
  const config = engine.sanitizeConfiguration({ profile: mood.profile.id, volume: 1 });
  let errors = [], events = [], frames = [], bars = [], lastFrame = -1, lastBar = -1;
  const composer = new engine.WaveComposer(config, mood, () => {}, error => errors.push(String(error)));
  const packets = recording.packets;
  const duration = (packets.at(-1)?.elapsed_ms ?? 0) / 1000 + tail;
  let index = 0, tick = 0;
  for (;;) {
    const packetTime = index < packets.length ? packets[index].elapsed_ms / 1000 : Infinity;
    const now = Math.min(packetTime, tick * 0.02);
    if (now > duration) break;
    if (packetTime <= tick * 0.02) {
      composer.push(packets[index++], now);
      await composer.whenAnalysisIdle();
    } else tick++;
    composer.advance(now);
    events.push(...composer.drain());
    const frame = composer.analysisSnapshot;
    if (frame && frame.id !== lastFrame) { frames.push(compactFrame(frame)); lastFrame = frame.id; }
    const plan = composer.planSnapshot;
    if (plan && plan.start !== lastBar) {
      bars.push({ time: plan.start, ...plan.bar, notes: plan.bar.notes.map(({ sourceFrame, ...note }) => ({ ...note, sourceAnalysis: sourceFrame?.id })) });
      lastBar = plan.start;
    }
  }
  composer.finish(duration); events.push(...composer.drain());
  if (errors.length) throw Error(errors.join('\n'));
  const notes = events.filter(event => event.type === 'note').map(event => event.note);
  return { config, duration, events, notes, frames, bars };
}
export async function loadBank(engine, notes, rate = 22050) {
  const manifest = JSON.parse(await readFile('assets/audio/sonora/manifest.json', 'utf8'));
  const bank = {};
  for (const program of new Set(notes.map(n => engine.preset(n.patch.preset).program).filter(Boolean))) {
    bank[program] = manifest.programs[program].map(entry => {
      const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', resolve('assets/audio/sonora', entry.file), '-f', 'f32le', '-ac', '1', '-ar', String(rate), 'pipe:1'], { maxBuffer: 64 * 1024 * 1024 });
      if (decoded.status !== 0) throw Error(decoded.error?.message || decoded.stderr.toString());
      const mono = new Float32Array(Uint8Array.from(decoded.stdout).buffer);
      let peak = 0, start = 0;
      for (const value of mono) peak = Math.max(peak, Math.abs(value));
      while (start < mono.length && Math.abs(mono[start]) < peak * .004) start++;
      const data = mono.slice(Math.max(0, start - 32));
      if (peak > .001) for (let i = 0; i < data.length; i++) data[i] *= .85 / peak;
      return { midi: entry.midi, rate, data };
    });
  }
  return bank;
}
export async function render(engine, score, file, rate = 22050) {
  const bank = await loadBank(engine, score.notes, rate);
  const pcm = await engine.synthesize(score, bank, rate);
  let peak = 0, squares = 0, invalid = 0;
  for (const channel of pcm.channels) for (const value of channel) {
    if (!Number.isFinite(value)) invalid++;
    peak = Math.max(peak, Math.abs(value)); squares += value * value;
  }
  const windows = [];
  const first = Math.floor((score.notes[0]?.time ?? 0) * rate);
  const last = Math.min(pcm.channels[0].length, Math.ceil(score.duration * rate));
  let longestQuiet = 0, quiet = 0;
  for (let start = first; start < last; start += Math.round(rate * .1)) {
    const end = Math.min(last, start + Math.round(rate * .1));
    let energy = 0;
    for (let i = start; i < end; i++) energy += (pcm.channels[0][i] ** 2 + pcm.channels[1][i] ** 2) / 2;
    const level = Math.sqrt(energy / (end - start)); windows.push(level);
    quiet = level < .0001 ? quiet + (end - start) / rate : 0;
    longestQuiet = Math.max(longestQuiet, quiet);
  }
  windows.sort((a,b)=>a-b);
  const encoded = spawnSync('ffmpeg' , ['-v', 'error', '-y', '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', '160k', file], { input: Buffer.from(engine.encodeWav(pcm)), maxBuffer: 64 * 1024 * 1024 });
  if (encoded.status !== 0) throw Error(encoded.error?.message || encoded.stderr.toString());
  return { peak, longestQuietBelowMinus80DbSeconds: longestQuiet, rms100msQuantiles: [.1,.5,.9].map(q=>windows[Math.floor((windows.length-1)*q)]), rms: Math.sqrt(squares / (pcm.channels[0].length * 2)), invalid, sampleRate: rate };
}
