import { synthVoice, type SynthVoice } from './synth-voices.ts';
import { clamp } from './signal.ts';
import {
  preset,
  defaultConfiguration,
  type Configuration,
  type Patch,
} from './presets.ts';
import type { Event, Note, Lane, Soundscape, Expression } from './composer.ts';
export type Sample = { midi: number; rate: number; data: Float32Array };
export type Bank = Record<string, Sample[]>;
export type PCM = {
  channels: [Float32Array, Float32Array];
  sampleRate: number;
};
export const RELEASE_SECONDS = 6;
const TAU = Math.PI * 2,
  SIZE = 2048;
const sine = Float32Array.from({ length: SIZE + 1 }, (_, i) =>
  Math.sin((i * TAU) / SIZE),
);
const sin = (phase: number) => {
  const x = (phase - Math.floor(phase)) * SIZE,
    i = x | 0; // Nonnegative table index; avoids a native Math call per partial.
  return sine[i] + (sine[i + 1] - sine[i]) * (x - i);
};
const smooth = (x: number) => {
  const v = clamp(x);
  return v * v * (3 - 2 * v);
};
class Effects {
  private dl: Float32Array;
  private dr: Float32Array;
  private at = 0;
  private chorusPhase = 0;
  private lines: Float32Array[];
  private indices = new Int32Array(4);
  private damp = new Float64Array(4);
  private rate: number;
  constructor(rate: number) {
    this.rate = rate;
    this.dl = new Float32Array(Math.ceil(rate * 1.3));
    this.dr = new Float32Array(this.dl.length);
    this.lines = [0.097, 0.131, 0.173, 0.211].map(
      (x) => new Float32Array(Math.ceil(rate * x)),
    );
  }
  private tap(b: Float32Array, seconds: number) {
    const x = (this.at - seconds * this.rate + b.length) % b.length,
      i = x | 0;
    return b[i] + (b[(i + 1) % b.length] - b[i]) * (x - i);
  }
  process(l: number, r: number, p: Patch): [number, number] {
    const d = p.delay,
      c = p.chorus,
      rv = p.reverb;
    const dt = 0.07 + 1.1 * (1 - d.rate / 100),
      echoL = this.tap(this.dr, dt),
      echoR = this.tap(this.dl, dt * 1.017);
    this.dl[this.at] = l + (d.on ? echoL * 0.32 : 0);
    this.dr[this.at] = r + (d.on ? echoR * 0.32 : 0);
    if (c.on) {
      this.chorusPhase += (0.08 + (c.rate / 100) * 1.12) / this.rate;
      const depth = c.depth / 100;
      const cl = this.tap(
          this.dl,
          0.018 + sin(this.chorusPhase) * 0.003 * depth,
        ),
        cr = this.tap(
          this.dr,
          0.021 + sin(this.chorusPhase + 0.25) * 0.003 * depth,
        );
      l = l * (1 - depth * 0.35) + cl * depth * 0.35;
      r = r * (1 - depth * 0.35) + cr * depth * 0.35;
    }
    if (d.on) {
      const wet = d.wet / 100;
      l = l * (1 - wet) + echoL * wet;
      r = r * (1 - wet) + echoR * wet;
    }
    let sum = 0;
    for (let j = 0; j < 4; j++) {
      this.damp[j] += (this.lines[j][this.indices[j]] - this.damp[j]) * 0.3;
      sum += this.damp[j];
    }
    const feedback = 0.48 + (rv.amount / 100) * 0.4;
    for (let j = 0; j < 4; j++) {
      this.lines[j][this.indices[j]] =
        (j % 2 ? r : l) * 0.3 + (sum * 0.5 - this.damp[j]) * feedback;
      this.indices[j] = (this.indices[j] + 1) % this.lines[j].length;
    }
    // Early reflections retain note articulation even in fully wet presets.
    const earlyL = this.tap(this.dl, 0.023),
      earlyR = this.tap(this.dr, 0.031),
      wetL =
        earlyL * 0.78 +
        (this.damp[0] + this.damp[1] - this.damp[2] - this.damp[3]) * 0.22,
      wetR =
        earlyR * 0.78 +
        (this.damp[0] - this.damp[1] + this.damp[2] - this.damp[3]) * 0.22;
    this.at = (this.at + 1) % this.dl.length;
    if (rv.on) {
      const wet = rv.wet / 100;
      l = l * (1 - wet) + wetL * wet;
      r = r * (1 - wet) + wetR * wet;
    }
    this.output[0] = l;
    this.output[1] = r;
    return this.output;
  }
  private output: [number, number] = [0, 0];
}
type Voice = {
  note: Note;
  sample: Sample | null;
  sample2: Sample | null;
  position: number;
  position2: number;
  increment: number;
  increment2: number;
  phase: number;
  phase2: number;
  detuneRatio: number;
  design: SynthVoice;
  frequency: number;
  attenuation: number;
  harmonics: number[];
  ratios: number[];
  attack: number;
  release: number;
  stop: number;
  forced: number;
  panL: number;
  panR: number;
  flavor: number;
  model: string | undefined;
  gain: number;
};
/** Shared note preparation: native PCM and the reference DSP use the same presets. */
export function prepareVoice(rate: number, bank: Bank, n: Note): Voice | undefined {
  const sampleFor = (program: string | undefined, midi: number) =>
    (program ? bank[program] : undefined)?.reduce((a, b) =>
      Math.abs(a.midi - midi) <= Math.abs(b.midi - midi) ? a : b) ?? null;
  if (n.velocity <= 0) return;
  const desc = preset(n.patch.preset),
    isGreeting = n.lane === 'greeting';
  const program = isGreeting ? 'orchestral_harp' : desc.program;
  const sample = sampleFor(
      program === 'choir_organ' ? 'choir_aahs' : program,
      n.midi,
    ),
    sample2 =
      program === 'choir_organ'
        ? sampleFor('church_organ', n.midi)
        : null;
  // Missing assets are reported by the adapter; do not silently substitute an oscillator for a sampled instrument.
  if (n.lane !== 'synth' && !sample && !desc.model) return;
  const frequency = n.patch.tuning * 2 ** ((n.midi - 69) / 12),
    flavor = desc.flavor;
  const design = synthVoice(n.patch.preset);
  const harmonics = design.harmonics.map((x, i) =>
    frequency * (i + 1) < rate * 0.42 ? x : 0,
  );
  // Compare timbres at similar energy; more upper partials must not just mean more volume.
  const normalization = Math.min(
    1.6,
    0.96 / Math.sqrt(harmonics.reduce((sum, x) => sum + x * x, 0)),
  );
  for (let i = 0; i < harmonics.length; i++) harmonics[i] *= normalization;
  return {
    note: n,
    sample,
    sample2,
    position: 0,
    position2: 0,
    increment: sample
      ? ((sample.rate / rate) *
          2 ** ((n.midi - sample.midi) / 12) *
          n.patch.tuning) /
        440
      : 0,
    increment2: sample2
      ? ((sample2.rate / rate) *
          2 ** ((n.midi - sample2.midi) / 12) *
          n.patch.tuning) /
        440
      : 0,
    phase: 0,
    phase2: 0.07,
    detuneRatio: 2 ** (design.detune / 1200),
    design,
    frequency,
    attenuation: Math.min(1, Math.sqrt(880 / frequency)),
    harmonics,
    ratios: desc.model === 'bowl' ? [1, 2.71, 4.05, 5.43] : [1, 2, 3, 4],
    attack: isGreeting
      ? 0.14
      : n.patch.envelope.on
        ? 0.004 +
          (n.lane === 'synth' ? 1.3 : 0.45) *
            (n.patch.envelope.attack / 100) ** 2
        : n.lane === 'synth'
          ? 0.08
          : 0.004,
    release: isGreeting
      ? 2.8
      : n.patch.envelope.on
        ? 0.06 + 3.5 * (n.patch.envelope.release / 100) ** 2
        : 0.35,
    stop: n.time + n.duration,
    forced: Infinity,
    panL: Math.sqrt((1 - clamp(n.pan, -1, 1)) / 2),
    panR: Math.sqrt((1 + clamp(n.pan, -1, 1)) / 2),
    flavor,
    model: desc.model,
    gain:
      (isGreeting ? 0.34 : n.lane === 'synth' ? 0.17 : 0.2) *
      (n.velocity / 100) ** 1.15,
  };
}
/** Fixed voice budget, bounded effect buffers, no DOM or platform audio calls. */
export class AudioCore {
  private config: Configuration;
  private bank: Bank;
  private voices: Voice[] = [];
  private pending: Event[] = [];
  private cancelled = new Set<number>();
  private cursor = 0;
  private duck = 1;
  private greetingAt = -Infinity;
  private expression: Expression = {
    brightness: 0.35,
    energy: 0.3,
    direction: 0,
    bands: Array(9).fill(0.33),
  };
  private targetExpression = this.expression;
  private expressionBands = new Float64Array(9).fill(0.33);
  private buses: Record<Lane, Effects>;
  private dcL = 0;
  private dcR = 0;
  private meters = { synth: 0, instrument: 0, greeting: 0 };
  private rate: number;
  constructor(rate: number, config = defaultConfiguration(), bank: Bank = {}) {
    this.rate = rate;
    this.config = config;
    this.bank = bank;
    this.buses = {
      synth: new Effects(rate),
      instrument: new Effects(rate),
      greeting: new Effects(rate),
    };
  }
  configure(config: Configuration, bank = this.bank) {
    this.config = config;
    this.bank = bank;
  }
  schedule(events: Event[]) {
    this.pending.push(...events);
    this.pending.sort((a, b) => a.time - b.time);
  }
  private start(n: Note) {
    const voice = prepareVoice(this.rate, this.bank, n);
    if (!voice) return;
    const same = this.voices.filter(
      (v) => v.note.lane === n.lane && v.forced === Infinity,
    );
    const limit = n.lane === 'synth' ? 6 : n.lane === 'instrument' ? 8 : 4;
    if (same.length >= limit) same[0].forced = this.time + 0.025;
    this.voices.push(voice);
    if (n.lane === 'greeting') this.greetingAt = this.time;
  }
  render(l: Float32Array, r: Float32Array) {
    let at = 0,
      maxS = 0,
      maxI = 0,
      maxG = 0;
    const dc = 1 - Math.exp((-TAU * 18) / this.rate);
    const expressionSlew = 1 - Math.exp(-1 / (0.18 * this.rate));
    const duckAttack = 1 - Math.exp(-1 / (0.08 * this.rate));
    const duckRelease = 1 - Math.exp(-1 / (0.8 * this.rate));
    const lanes: Lane[] = ['synth', 'instrument', 'greeting'];
    const levels = [
      this.config.synthLevel,
      this.config.instrumentLevel,
      this.config.greetingLevel,
    ];
    const greetPatch = {
      ...this.config.instrument,
      delay: { on: true, wet: 12, rate: 77 },
      reverb: { on: true, wet: 42, amount: 76 },
      chorus: { on: true, depth: 25, rate: 13 },
    };
    const patches = [this.config.synth, this.config.instrument, greetPatch];
    for (let i = 0; i < l.length; i++, this.cursor++) {
      const time = this.cursor / this.rate;
      while (at < this.pending.length && this.pending[at].time <= time) {
        const e = this.pending[at++];
        if (e.type === 'note') {
          if (this.cancelled.has(e.note.id)) this.cancelled.delete(e.note.id);
          else this.start(e.note);
        } else if (e.type === 'expression') {
          this.targetExpression = e.expression;
        } else {
          for (const v of this.voices)
            if (!e.lane || v.note.lane === e.lane)
              v.forced = Math.min(v.forced, time + 0.15);
          for (let j = at; j < this.pending.length; j++) {
            const q = this.pending[j];
            if (
              q.type === 'note' &&
              q.note.sourceTime <= e.time &&
              (!e.lane || q.note.lane === e.lane)
            )
              this.cancelled.add(q.note.id);
          }
        }
      }
      this.expression.brightness +=
        (this.targetExpression.brightness - this.expression.brightness) *
        expressionSlew;
      this.expression.energy +=
        (this.targetExpression.energy - this.expression.energy) *
        expressionSlew;
      this.expression.direction +=
        (this.targetExpression.direction - this.expression.direction) *
        expressionSlew;
      for (let band = 0; band < 9; band++)
        this.expressionBands[band] +=
          (this.targetExpression.bands[band] - this.expressionBands[band]) *
          expressionSlew;
      let sl = 0,
        sr = 0,
        il = 0,
        ir = 0,
        gl = 0,
        gr = 0;
      const brightness = clamp(this.expression.brightness),
        energy = clamp(this.expression.energy);
      for (const v of this.voices) {
        const age = time - v.note.time;
        if (time > Math.min(v.stop + v.release, v.forced)) continue;
        const envelope =
          (age < v.attack ? smooth(age / v.attack) : 1) *
          (time < v.stop ? 1 : 1 - smooth((time - v.stop) / v.release)) *
          (v.forced === Infinity ? 1 : clamp((v.forced - time) / 0.025));
        let value = 0;
        if (v.sample) {
          const p = Math.floor(v.position),
            a = v.sample.data;
          if (p < a.length - 1)
            value = a[p] + (a[p + 1] - a[p]) * (v.position - p);
          v.position += v.increment;
          if (v.sample2) {
            const q = Math.floor(v.position2),
              b = v.sample2.data;
            const other =
              q < b.length - 1
                ? b[q] + (b[q + 1] - b[q]) * (v.position2 - q)
                : 0;
            value = value * 0.6 + other * 0.4;
            v.position2 += v.increment2;
          }
        } else if (v.model) {
          for (let j = 0; j < v.ratios.length; j++)
            if (v.frequency * v.ratios[j] < this.rate * 0.43)
              value +=
                sin(age * v.frequency * v.ratios[j]) *
                Math.exp(
                  (-age * (1 + j * 0.6)) / (v.model === 'bowl' ? 2.8 : 1.4),
                ) *
                (j ? 0.3 / (j + 1) : 1);
        } else {
          v.phase += v.frequency / this.rate;
          v.phase -= v.phase | 0;
          v.phase2 += (v.frequency * v.detuneRatio) / this.rate;
          v.phase2 -= v.phase2 | 0;
          const design = v.design;
          const breathe = sin(age * design.evolution + v.note.color);
          const decay = 1 / (1 + age * design.decay);
          for (let j = 0; j < v.harmonics.length; j++) {
            const band = this.expressionBands[(j + design.trace) % 9];
            let weight = j ? 0.6 + brightness * 0.4 + band * 0.55 : 1;
            if (design.family === 'glass') weight *= j ? decay : 0.8;
            else if (design.family === 'plume')
              weight *= j ? decay * decay : 0.55 + decay * 0.45;
            else if (design.family === 'choir')
              weight *=
                0.72 +
                0.28 *
                  sin(
                    age * design.evolution +
                      j * 0.22 +
                      this.expression.direction * 0.18,
                  );
            else if (design.family === 'strings')
              weight *= 0.86 + 0.14 * sin(age * design.evolution + j * 0.31);
            else if (design.family === 'reed')
              weight *= j % 2 ? 0.7 : 1 + band * 0.25;
            else weight *= j ? 0.84 + 0.16 * breathe : 1;
            const partial =
              sin(v.phase * (j + 1)) * (1 - design.blend) +
              sin(v.phase2 * (j + 1)) * design.blend;
            value += partial * v.harmonics[j] * weight;
          }
          value *=
            (0.9 + energy * 0.14 + breathe * 0.05) *
            v.attenuation;
        }
        if (v.note.lane === 'greeting') {
          const bloom =
            sin(age * v.frequency) * 0.58 + sin(age * v.frequency * 2) * 0.16;
          let dust = 0;
          for (let k = 0; k < 4; k++) {
            const elapsed = age - k * 0.19,
              harmonic = k + 2;
            if (elapsed > 0 && v.frequency * harmonic < this.rate * 0.43)
              dust +=
                (sin(elapsed * v.frequency * harmonic) *
                  smooth(elapsed / 0.2) *
                  Math.exp(-elapsed / (1.05 + k * 0.16)) *
                  0.12) /
                (1 + k * 0.5);
          }
          value = value * 0.3 + bloom * Math.exp(-age / 2.1) + dust;
        }
        value *= envelope * v.gain;
        if (v.note.lane === 'synth') {
          const drift =
            this.expression.direction * 0.13 +
            sin(age * 0.08 + v.note.pan) * 0.05;
          sl += value * v.panL * (1 - drift);
          sr += value * v.panR * (1 + drift);
        } else if (v.note.lane === 'instrument') {
          il += value * v.panL;
          ir += value * v.panR;
        } else {
          gl += value * v.panL;
          gr += value * v.panR;
        }
      }
      const duckTarget = time - this.greetingAt < 1.8 ? 0.48 : 1;
      this.duck +=
        (duckTarget - this.duck) *
        (duckTarget < this.duck ? duckAttack : duckRelease);
      let left = 0,
        right = 0;
      for (let j = 0; j < 3; j++) {
        const [bl, br] = this.buses[lanes[j]].process(
          j === 0 ? sl : j === 1 ? il : gl,
          j === 0 ? sr : j === 1 ? ir : gr,
          patches[j],
        );
        const gain = levels[j] * (j < 2 ? this.duck : 1);
        left += bl * gain;
        right += br * gain;
        const peak = Math.max(Math.abs(bl * gain), Math.abs(br * gain));
        if (j === 0) maxS = Math.max(maxS, peak);
        else if (j === 1) maxI = Math.max(maxI, peak);
        else maxG = Math.max(maxG, peak);
      }
      this.dcL += (left - this.dcL) * dc;
      this.dcR += (right - this.dcR) * dc;
      l[i] = Math.tanh((left - this.dcL) * 1.65) * 0.9;
      r[i] = Math.tanh((right - this.dcR) * 1.65) * 0.9;
      if (this.cursor % 128 === 0)
        this.voices = this.voices.filter(
          (v) => time < Math.min(v.stop + v.release, v.forced),
        );
    }
    if (at) this.pending.splice(0, at);
    this.meters = {
      synth: Math.max(maxS, this.meters.synth * 0.92),
      instrument: Math.max(maxI, this.meters.instrument * 0.92),
      greeting: Math.max(maxG, this.meters.greeting * 0.92),
    };
  }
  get time() {
    return this.cursor / this.rate;
  }
  get status() {
    return {
      voices: this.voices.length,
      meters: this.meters,
      greeting: this.time - this.greetingAt < 3.2,
      pending: this.pending.length,
    };
  }
}
export async function synthesize(
  score: Soundscape,
  bank: Bank,
  sampleRate = 32000,
  cancelled = () => false,
  progress = (_n: number) => {},
) {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 96000)
    throw Error('Frecuencia de audio no válida.');
  if (
    !Number.isFinite(score.duration) ||
    score.duration <= 0 ||
    score.duration > 1800
  )
    throw Error('El laboratorio admite hasta 30 minutos por grabación.');
  const length = Math.ceil((score.duration + RELEASE_SECONDS) * sampleRate),
    channels: [Float32Array, Float32Array] = [
      new Float32Array(length),
      new Float32Array(length),
    ];
  const synth = new AudioCore(sampleRate, score.config, bank);
  synth.schedule(score.events);
  for (let i = 0; i < length; i += 8192) {
    if (cancelled()) throw Error('Preparación cancelada.');
    synth.render(
      channels[0].subarray(i, i + 8192),
      channels[1].subarray(i, i + 8192),
    );
    progress(Math.min(1, (i + 8192) / length));
    await new Promise<void>((r) => setTimeout(r, 0));
  }
  for (const c of channels)
    for (let i = Math.max(0, length - sampleRate); i < length; i++)
      c[i] *= (length - i - 1) / sampleRate;
  return { channels, sampleRate };
}
export function encodeWav(pcm: PCM) {
  const [l, r] = pcm.channels,
    bytes = new ArrayBuffer(44 + l.length * 4),
    v = new DataView(bytes);
  const put = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  put(0, 'RIFF');
  v.setUint32(4, bytes.byteLength - 8, true);
  put(8, 'WAVE');
  put(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, pcm.sampleRate, true);
  v.setUint32(28, pcm.sampleRate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  put(36, 'data');
  v.setUint32(40, l.length * 4, true);
  for (let i = 0; i < l.length; i++) {
    v.setInt16(44 + i * 4, Math.round(clamp(l[i], -1, 1) * 32767), true);
    v.setInt16(46 + i * 4, Math.round(clamp(r[i], -1, 1) * 32767), true);
  }
  return bytes;
}
