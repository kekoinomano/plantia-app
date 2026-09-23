import { readFile, writeFile, readdir, mkdir, mkdtemp, access } from 'node:fs/promises';
import { resolve, basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { loadEngine, replay, render } from './lib/wave-replay.mjs';
import { DEFAULT_LIMITS, MOOD_LIMITS, analyse, compare } from './lib/mood-metrics.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const help = `Uso: npm run moods:test -- [--sample suegra2.json] [--mood lofi-waves]
  --sample, --datasample  Nombre en datasamples/ o ruta a un JSON.
  --mood                 ID del mood; también acepta lofi.
  --out                  Carpeta padre de resultados (por defecto output/mood-tests).
  --thresholds           JSON con { defaults: {...}, moods: { sleep: {...} } }.
Sin un filtro se incluyen todos sus valores. Cada ejecución crea una carpeta nueva.
Genera MP3, trazas JSON e informe Markdown. Requiere FFmpeg con libmp3lame.
Salida: 0 aprobado, 1 fallo/error, 2 datos insuficientes (sin fallos).
Documentación: docs/music/TEST_MOODS.md`;
const options = {};
const args = process.argv.slice(2);

function validateRecording(recording) {
  if (!Array.isArray(recording.packets) || !recording.packets.length) throw Error('La grabación no contiene packets.');
  let previous = -1;
  for (const [index, packet] of recording.packets.entries()) {
    if (!packet || !Number.isFinite(packet.elapsed_ms) || packet.elapsed_ms < 0 || packet.elapsed_ms < previous)
      throw Error(`Tiempo inválido o desordenado en packets[${index}].`);
    previous = packet.elapsed_ms;
  }
  // Raw values and errors are passed unchanged to the real ingestion validator.
}
function limitsFor(id, custom) {
  const limits = { ...DEFAULT_LIMITS, ...MOOD_LIMITS[id], ...custom.defaults, ...custom.moods?.[id] };
  for (const [key, value] of Object.entries(limits)) {
    if (!(key in DEFAULT_LIMITS) || !Number.isFinite(value) || value < 0) throw Error(`Umbral inválido: ${key}`);
  }
  if (!Number.isInteger(limits.blockBars) || limits.blockBars < 1 || !Number.isInteger(limits.minimumBlocks)
    || limits.minimumBlocks < 3 || limits.internalMin > limits.internalMax || limits.internalMax > 1
    || limits.crossMin > 1 || limits.crossRatio < 1) throw Error('Umbrales incompatibles.');
  return limits;
}
const json = value => JSON.stringify(value, null, 2);
const safe = value => value.replace(/[^a-zA-Z0-9_-]/g, '_');
const hash = value => createHash('sha256').update(value).digest('hex');

async function main() {
  if (args.includes('--help') || args.includes('-h')) { console.log(help); return; }
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i] === '--datasample' ? '--sample' : args[i];
    if (!['--sample', '--mood', '--out', '--thresholds'].includes(key)
      || !args[i + 1] || args[i + 1].startsWith('--') || options[key]) throw Error(`Argumento inválido: ${args[i]}\n${help}`);
    options[key] = args[i + 1];
  }
  const engine = await loadEngine();
  const id = options['--mood'] === 'lofi' ? 'lofi-waves' : options['--mood'];
  const moods = id ? engine.WAVE_MOODS.filter(m => m.profile.id === id) : engine.WAVE_MOODS;
  if (!moods.length) throw Error(`Mood desconocido. Disponibles: ${engine.WAVE_MOODS.map(m => m.profile.id).join(', ')}`);
  let files;
  if (options['--sample']) {
    let file = resolve(options['--sample']);
    try { await access(file); } catch { file = resolve('datasamples', options['--sample']); }
    files = [file];
  } else files = (await readdir('datasamples', { withFileTypes: true }))
    .filter(f => f.isFile() && f.name.endsWith('.json')).map(f => resolve('datasamples', f.name)).sort();
  if (!files.length) throw Error('No hay datasamples JSON.');
  const custom = options['--thresholds'] ? JSON.parse(await readFile(resolve(options['--thresholds']), 'utf8')) : {};
  const thresholds = Object.fromEntries(moods.map(m => [m.profile.id, limitsFor(m.profile.id, custom)]));
  const ffmpeg = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if (ffmpeg.status !== 0) throw Error('FFmpeg no está disponible en PATH. Instálalo antes de ejecutar este comando.');
  const parent = resolve(options['--out'] ?? 'output/mood-tests');
  await mkdir(parent, { recursive: true });
  const output = await mkdtemp(join(parent, `${new Date().toISOString().replace(/[:.]/g, '-')}-`));
  const report = { version: 1, createdAt: new Date().toISOString(), thresholds, runs: [], pairs: [],
    comparison: options['--sample'] ? 'No solicitada: datasample explícito.' : 'Todos los pares por mood.',
    renderer: 'Sonora JS offline, 22050 Hz, MP3 160 kbps', ffmpeg: ffmpeg.stdout.split('\n')[0] };
  const statuses = [];
  for (const mood of moods) {
    const moodId = mood.profile.id;
    for (const [index, file] of files.entries()) {
      const name = `${safe(moodId)}--${index + 1}-${safe(basename(file, '.json'))}`;
      console.log(`[${moodId}] ${basename(file)}`);
      const run = { mood: moodId, sample: file, artifact: `${name}.json`, checks: [] };
      try {
        const raw = await readFile(file, 'utf8');
        const recording = JSON.parse(raw); validateRecording(recording);
        run.sha256 = hash(raw);
        const score = await replay(engine, recording, { mood });
        run.duration = score.duration; run.notes = score.notes.length; run.frames = score.frames.length;
        run.firstNoteSeconds = score.notes[0]?.time ?? null;
        run.analysis = analyse(score, engine, thresholds[moodId]);
        run.checks.push(...run.analysis.checks);
        const valid = score.notes.length > 0 && score.notes.every(n =>
          [n.time, n.duration, n.midi, n.velocity].every(Number.isFinite)
          && n.time >= 0 && n.duration > 0 && n.midi >= 0 && n.midi <= 127);
        run.checks.push({ name: 'Notas emitidas válidas', status: valid ? 'PASS' : 'FAIL' });
        // Always retain the decision trace, including when audio rendering fails.
        await writeFile(join(output, run.artifact), json({ ...run, config: score.config,
          frames: score.frames, bars: score.bars, events: score.events }));
        if (valid) {
          run.audio = await render(engine, score, join(output, `${name}.mp3`));
          run.mp3 = `${name}.mp3`;
          run.checks.push({ name: 'Audio finito y no vacío', status:
            run.audio.invalid === 0 && Number.isFinite(run.audio.rms) && run.audio.rms > .00001 ? 'PASS' : 'FAIL' });
        }
      } catch (error) {
        run.error = error.message;
        run.checks.push({ name: 'Procesamiento', status: 'FAIL', detail: error.message });
      }
      statuses.push(...run.checks.map(c => c.status)); report.runs.push(run);
      console.log(`  ${run.checks.map(c => `${c.status}: ${c.name}`).join(' · ')}`);
      await writeFile(join(output, 'report.json'), json(report));
    }
    if (!options['--sample']) {
      const runs = report.runs.filter(r => r.mood === moodId && r.analysis && !r.error);
      if (runs.length < 2) {
        report.pairs.push({ mood: moodId, status: 'INSUFFICIENT', reason: 'Se necesitan dos grabaciones procesadas.' });
        statuses.push('INSUFFICIENT');
      }
      for (let a = 0; a < runs.length; a++) for (let b = a + 1; b < runs.length; b++) {
        const pair = { mood: moodId, a: runs[a].sample, b: runs[b].sample,
          ...compare(runs[a].analysis, runs[b].analysis, thresholds[moodId]) };
        report.pairs.push(pair); statuses.push(pair.status);
      }
    }
  }
  report.status = statuses.includes('FAIL') ? 'FAIL' : statuses.includes('INSUFFICIENT') ? 'INSUFFICIENT' : 'PASS';
  const lines = [`# Prueba de moods: ${report.status}`, '',
    'Las métricas detectan repetición y diferencias estructurales; no certifican belleza ni coherencia armónica percibida.', '',
    ...report.runs.flatMap(r => [`## ${r.mood} · ${basename(r.sample)}`, '',
      ...(r.mp3 ? [`[Escuchar MP3](./${r.mp3}) · [Traza de decisiones](./${r.artifact})`, ''] : []),
      ...r.checks.map(c => `- **${c.status}** ${c.name}${c.value !== undefined ? `: ${c.value.toFixed(4)} (${c.required})` : ''}${c.detail ? `: ${c.detail}` : ''}`),
      ...(r.audio ? [`- Mayor silencio tras el arranque: ${r.audio.longestQuietBelowMinus80DbSeconds.toFixed(2)} s; pico: ${r.audio.peak.toFixed(3)}.`] : []), '']),
    '## Diferencias entre grabaciones', '', report.comparison, '',
    ...report.pairs.map(p => `- **${p.status}** ${p.mood}: ${p.reason ?? `${basename(p.a)} / ${basename(p.b)}: ${p.value.toFixed(4)}; mínimo ${p.required.toFixed(4)} (${p.blocks} bloques).`}`), ''];
  await writeFile(join(output, 'report.json'), json(report));
  await writeFile(join(output, 'report.md'), lines.join('\n'));
  console.log(`\n${report.status} — ${join(output, 'report.md')}`);
  process.exitCode = report.status === 'FAIL' ? 1 : report.status === 'INSUFFICIENT' ? 2 : 0;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
