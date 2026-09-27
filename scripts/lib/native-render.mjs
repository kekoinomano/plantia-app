import { readFile, writeFile, mkdtemp, rm, access, mkdir, readdir, rename, stat } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = resolve('scripts/native-mood-render');
const buildDir = '/tmp/plantia-mood-render-build';
const executable = join(buildDir, 'plantia-mood-render');
const cmake = spawnSync('which', ['cmake'], { encoding: 'utf8' }).stdout.trim()
  || join(homedir(), 'Library/Android/sdk/cmake/3.22.1/bin/cmake');
const lanes = ['synth', 'instrument', 'greeting'];
const families = ['', 'glass', 'plume', 'choir', 'strings', 'reed'];
let rendererReady = false;

function run(program, args, options = {}) {
  const result = spawnSync(program, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, ...options });
  if (result.status !== 0) throw Error(`${program}: ${result.error?.message ?? result.stderr?.slice(-3000) ?? 'fallo'}`);
  return result;
}

async function ensureRenderer() {
  if (rendererReady) return;
  const cmakeBin = process.env.CMAKE || cmake;
  try { await access(executable); } catch {
    run(cmakeBin, ['-S', source, '-B', buildDir, '-DCMAKE_BUILD_TYPE=Release', '-DENABLE_LTO=OFF']);
  }
  run(cmakeBin, ['--build', buildDir, '--target', 'plantia-mood-render', '--parallel', '6']);
  rendererReady = true;
}

function stats(pcm, score, rate) {
  let peak = 0, squares = 0, invalid = 0, nearCeiling = 0;
  const start = Math.floor((score.notes[0]?.time ?? 0) * rate);
  const end = Math.min(pcm.length / 2, Math.ceil(score.duration * rate));
  let longestQuiet = 0, quiet = 0;
  for (let i = 0; i < pcm.length; i++) {
    const value = pcm[i];
    if (!Number.isFinite(value)) invalid++;
    peak = Math.max(peak, Math.abs(value)); squares += value * value;
    if (Math.abs(value) >= .85) nearCeiling++;
  }
  const windows = [], windowFrames = Math.round(rate * .1);
  for (let at = start; at < end; at += windowFrames) {
    let energy = 0, count = Math.min(windowFrames, end - at);
    for (let i = at; i < at + count; i++) energy += (pcm[2*i] ** 2 + pcm[2*i+1] ** 2) / 2;
    const rms = Math.sqrt(energy / count);
    windows.push(rms);
    quiet = rms < .0001 ? quiet + count / rate : 0;
    longestQuiet = Math.max(longestQuiet, quiet);
  }
  windows.sort((a, b) => a - b);
  return { peak, nearCeilingFraction: nearCeiling / pcm.length, invalid,
    rms: Math.sqrt(squares / pcm.length), sampleRate: rate,
    longestQuietBelowMinus80DbSeconds: longestQuiet,
    rms100msQuantiles: [.1, .5, .9].map(q => windows[Math.floor((windows.length - 1) * q)] ?? 0) };
}

export async function renderNative(engine, score, file, rate = 48000) {
  await ensureRenderer();
  const catalog = Object.values(JSON.parse(await readFile('assets/audio/sfz/manifest.json', 'utf8')));
  const instruments = new Map(catalog.map(item => [item.program, item]));
  const channels = engine.audioChannels(score.config);
  const patch = (level, p) => [level, +p.delay.on, p.delay.wet, p.delay.rate,
    +p.chorus.on, p.chorus.depth, p.chorus.rate, +p.reverb.on, p.reverb.wet, p.reverb.amount];
  const lines = [`${rate} ${score.duration}`, `C 1 ${channels.flatMap(c => [lanes.indexOf(c.kind), ...patch(c.level, c.patch)]).join(' ')}`];
  const temp = await mkdtemp(join(tmpdir(), 'plantia-mood-'));
  const sfz = new Map();
  try {
    for (const event of score.events) {
      if (event.type !== 'note') continue;
      const channel = channels.findIndex(c => event.note.slot ? c.id === event.note.slot : c.kind === event.note.lane);
      if (channel < 0 || channels[channel].level <= 0) continue;
      const program = engine.preset(event.note.patch.preset).program;
      if (!program) continue;
      const instrument = instruments.get(program);
      if (!instrument) throw Error(`Falta paquete SFZ para ${program}`);
      const address = `${channel}:${program}`;
      if (sfz.has(address)) continue;
      const folder = join(tmpdir(), 'plantia-sfz-mood-render', program);
      const path = join(folder, instrument.patch);
      const packs = (instrument.packs ?? [instrument.pack]).map(name => resolve('assets/audio/sfz', name));
      const packageInfo = await Promise.all(packs.map(pack => stat(pack)));
      const stamp = packageInfo.map(info => `${info.size}:${info.mtimeMs}`).join('|');
      const complete = async () => {
        try {
          await access(path);
          return (await readFile(join(folder, '.pack-stamp'), 'utf8')) === stamp
            && (await readdir(folder, { recursive: true })).filter(name => name.endsWith('.flac')).length === instrument.samples;
        } catch { return false; }
      };
      if (!await complete()) {
        const staging = `${folder}-installing`;
        await rm(staging, { recursive: true, force: true });
        await mkdir(staging, { recursive: true });
        for (const pack of packs) run('unzip', ['-qq', pack, '-d', staging]);
        const unpacked = (await readdir(staging, { recursive: true })).filter(name => name.endsWith('.flac')).length;
        if (unpacked !== instrument.samples) throw Error(`Paquete SFZ incompleto: ${program} (${unpacked}/${instrument.samples})`);
        await writeFile(join(staging, '.pack-stamp'), stamp);
        await rm(folder, { recursive: true, force: true });
        await rename(staging, folder);
      }
      const key = sfz.size + 1;
      sfz.set(address, { key, instrument });
      lines.push(`L ${key} ${channel} ${instrument.gain} ${event.note.patch.tuning} ${JSON.stringify(path)}`);
    }
    for (const event of score.events) {
      if (event.type === 'expression') {
        const x = event.expression;
        lines.push(`E 1 ${event.time} ${[x.brightness, x.energy, x.direction, ...x.bands, x.space ?? 0, x.smoothing ?? .4].join(' ')}`);
      } else if (event.type === 'release') {
        const channel = event.slot ? channels.findIndex(c => c.id === event.slot) :
          event.lane ? channels.findIndex(c => c.kind === event.lane) : -1;
        if ((event.slot || event.lane) && channel < 0) continue;
        lines.push(`E 2 ${event.time} ${channel}`);
      } else {
        const n = event.note;
        const channel = channels.findIndex(c => n.slot ? c.id === n.slot : c.kind === n.lane);
        if (channel < 0) continue;
        const program = engine.preset(n.patch.preset).program;
        const layer = sfz.get(`${channel}:${program}`);
        if (layer) {
          let midi = layer.instrument.fixedNote ?? Math.round(n.midi);
          while (layer.instrument.minNote !== undefined && midi < layer.instrument.minNote) midi += 12;
          while (layer.instrument.maxNote !== undefined && midi > layer.instrument.maxNote) midi -= 12;
          if (n.velocity > 0) lines.push(`S ${event.time} ${layer.key} ${Math.max(0, Math.min(127, midi))} ${Math.max(1, Math.min(127, Math.round(n.velocity * 1.27)))} ${Math.max(.01, n.duration)}`);
          continue;
        }
        const v = engine.prepareVoice(rate, {}, n);
        if (!v) continue;
        const values = [0, event.time, n.id, n.time, n.sourceTime, channel, v.stop, v.attack, v.release,
          0, 0, v.increment, v.increment2, v.detuneRatio, v.frequency, v.attenuation, v.panL, v.panR, v.gain,
          n.color, n.pan, engine.modelId(v.model), Math.max(0, families.indexOf(v.design.family)),
          v.design.evolution, v.design.decay, v.design.blend, v.design.trace,
          ...v.harmonics, ...v.ratios, v.phase, v.phase2, 0];
        lines.push(`E ${values.join(' ')}`);
      }
    }
    const scoreFile = join(temp, 'score.txt'), rawFile = join(temp, 'audio.f32');
    await writeFile(scoreFile, lines.join('\n'));
    run(executable, [scoreFile, rawFile]);
    const raw = await readFile(rawFile);
    const pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    const metrics = stats(pcm, score, rate);
    if (metrics.rms === 0) await writeFile(`${file}.score.txt`, lines.join('\n'));
    run('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(rate), '-ac', '2', '-i', rawFile,
      '-codec:a', 'libmp3lame', '-b:a', '256k', file]);
    return metrics;
  } finally { await rm(temp, { recursive: true, force: true }); }
}
