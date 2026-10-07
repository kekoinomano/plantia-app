import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { loadRecording } from './recordings';
import { sanitizeConfiguration, type Configuration } from './sonora/presets';
import { waveMood } from './wave-music/registry';
import { WaveComposer } from './wave-music/composer';
import { SampleBank } from './audio/bank';
import { NativePcmCore } from './audio/native-pcm';
import type { Event } from './sonora/music-types';
import { t } from './i18n';

const RATE = 44_100;
const CHUNK = RATE; // One second per bridge call; Sonora still renders internally in 4096-frame blocks.
const breathe = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** Compose in JS, then render and encode inside the native Sonora module. */
export async function exportRecordingMp3(id: string, configuration: Configuration,
  onProgress: (progress: number) => void = () => {}, signal?: AbortSignal): Promise<string> {
  const startedAt = performance.now();
  const checkCanceled = () => { if (signal?.aborted) throw new Error('Exportación cancelada.'); };
  const recording = loadRecording(id);
  const profile = configuration.profile;
  const mood = waveMood(profile);
  if (!mood) throw new Error('Mood desconocido.');
  const config = sanitizeConfiguration({ ...configuration, volume: 1 });
  const duration = (recording.packets.at(-1)?.elapsed_ms ?? 0) / 1000 + 3.6;
  const events: Event[] = [];
  const errors: string[] = [];
  const composer = new WaveComposer(config, mood, () => {}, error => errors.push(String(error)), 16);
  let index = 0, tick = 0;
  while (true) {
    checkCanceled();
    const packetTime = index < recording.packets.length ? recording.packets[index].elapsed_ms / 1000 : Infinity;
    const now = Math.min(packetTime, tick * .02);
    if (now > duration) break;
    if (packetTime <= tick * .02) {
      composer.push(recording.packets[index++], now);
      await composer.whenAnalysisIdle();
      if (index % 100 === 0) { onProgress(index / recording.packets.length * .35); await breathe(); }
    } else tick++;
    composer.advance(now);
    events.push(...composer.drain());
  }
  composer.finish(duration);
  events.push(...composer.drain());
  if (errors.length) throw new Error(errors.join('\n'));
  if (!events.some(event => event.type === 'note')) throw new Error('La grabación es demasiado corta para crear música con este mood.');
  events.sort((a, b) => a.time - b.time);
  const composedAt = performance.now();
  console.info('[saviasound Export]', JSON.stringify({ phase: 'composition', ms: Math.round(composedAt - startedAt), events: events.length }));
  onProgress(.35);

  const bank = await new SampleBank().load(config);
  checkCanceled();
  console.info('[saviasound Export]', JSON.stringify({ phase: 'instruments', ms: Math.round(performance.now() - composedAt) }));
  const core = new NativePcmCore(RATE, config, bank, true);
  const folder = new Directory(Paths.cache, 'recording-exports');
  folder.create({ idempotent: true, intermediates: true });
  const safeName = recording.session.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 60) || t('Grabación');
  const output = new File(folder, `${safeName}-${profile}-${id}.mp3`);
  let started = false, finished = false;
  try {
    core.beginMp3(output.uri);
    started = true;
    const renderStartedAt = performance.now();
    const frames = Math.ceil(duration * RATE);
    let rendered = 0, eventIndex = 0;
    while (rendered < frames) {
      checkCanceled();
      const count = Math.min(CHUNK, frames - rendered);
      const blockEnd = (rendered + count) / RATE;
      const nextEvents: Event[] = [];
      while (eventIndex < events.length && events[eventIndex].time < blockEnd) nextEvents.push(events[eventIndex++]);
      if (nextEvents.length) core.schedule(nextEvents);
      core.renderMp3(count);
      rendered += count;
      onProgress(.35 + rendered / frames * .65);
      await breathe();
    }
    core.finishMp3();
    finished = true;
    console.info('[saviasound Export]', JSON.stringify({ phase: 'render-and-mp3', ms: Math.round(performance.now() - renderStartedAt), seconds: Math.round(duration) }));
    onProgress(1);
    return output.uri;
  } catch (error) {
    if (started && !finished) {
      try { core.cancelMp3(); } catch { /* Keep the original export error. */ }
    }
    if (output.exists) output.delete();
    throw error;
  } finally {
    core.close();
  }
}

export async function shareMp3(uri: string) {
  if (!await Sharing.isAvailableAsync()) throw new Error('No se puede compartir el archivo en este dispositivo.');
  await Sharing.shareAsync(uri, { mimeType: 'audio/mpeg', UTI: 'public.mp3' });
}
