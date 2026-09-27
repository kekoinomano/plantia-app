import { renderNative } from './native-render.mjs';
import { build } from 'esbuild';

export async function loadEngine() {
  const { outputFiles } = await build({ stdin: { contents: `
export { WAVE_MOODS, waveMood } from './src/lib/wave-music/registry';
export { WaveComposer } from './src/lib/wave-music/composer';
export { lofiWaves, makeLofiMood } from './src/lib/wave-music/moods/lofi';
export { GreetingDetector } from './src/lib/wave-music/greeting';
export { musicalFeatures, signalIdentity } from './src/lib/wave-music/musical-field';
export { sanitizeConfiguration, preset } from './src/lib/sonora/presets';
export { synthesize, encodeWav, prepareVoice } from './src/lib/sonora/dsp';
export { modelId } from './src/lib/sonora/dsp';
export { audioChannels } from './src/lib/sonora/presets';
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
export async function render(engine, score, file, rate = 48000) {
  return renderNative(engine, score, file, rate);
}
