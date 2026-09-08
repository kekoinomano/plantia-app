import { clamp, type Frame, type Analysis } from './signal.ts';
import { synthVoice } from './synth-voices.ts';
import { createGestureDetector } from './gesture.ts';
import {
  defaultConfiguration,
  sanitizeConfiguration,
  notePool,
  copyPatch,
  type Configuration,
  type Patch,
} from './presets.ts';
export type Lane = 'synth' | 'instrument' | 'greeting';
export type Note = {
  id: number;
  time: number;
  sourceTime: number;
  source: number;
  midi: number;
  velocity: number;
  duration: number;
  lane: Lane;
  patch: Patch;
  color: number;
  pan: number;
  fade?: number;
  reason?: string;
  phraseStep?: number;
};
export type Expression = {
  brightness: number;
  energy: number;
  direction: number;
  bands: number[];
};
export type Event =
  | { type: 'expression'; time: number; expression: Expression }
  | { type: 'note'; time: number; note: Note }
  | { type: 'release'; time: number; lane?: Lane };
export type Soundscape = {
  duration: number;
  config: Configuration;
  events: Event[];
  notes: Note[];
};
/** No transport, audio API, database or species identity. Receives descriptors, emits a small note protocol. */
export class Composer {
  private config: Configuration;
  private gesture = createGestureDetector();
  private events: Event[] = [];
  private previous: Frame | null = null;
  private serial = 0;
  private lastLead = -Infinity;
  private lastSynth = -Infinity;
  private synthPitch = -1;
  private synthRegister: number | null = null;
  private baseline = 0;
  private lastPitch = -1;
  private stopped = false;
  private movement = 0;
  private phrase = 0;
  private nextLead = -Infinity;
  private nextSynth = -Infinity;
  private motif: number[] = [];
  private rhythm: number[] = [];
  private anchor = 0;
  private synthStep = 0;
  private character = { level: 0.5, pace: 0.5, variation: 0, texture: 0 };
  constructor(config = defaultConfiguration()) {
    this.config = sanitizeConfiguration(config);
  }
  configure(config: Configuration, time: number) {
    const next = sanitizeConfiguration(config);
    // Mixing and movement controls must not restart the musical phrase.
    for (const lane of ['synth', 'instrument'] as const) {
      if (JSON.stringify(next[lane]) === JSON.stringify(this.config[lane])) continue;
      this.events.push({ type: 'release', time, lane });
      if (lane === 'synth') this.resetSynth();
      else { this.nextLead = -Infinity; this.lastPitch = -1; }
    }
    this.config = next;
  }
  private resetSynth() {
    this.lastSynth = -Infinity;
    this.synthPitch = -1;
    this.synthRegister = null;
    this.nextSynth = -Infinity;
    this.synthStep = 0;
  }
  private emit(
    f: Frame,
    lane: Lane,
    midi: number,
    duration: number,
    velocity: number,
    pan: number,
    delay = 0,
    fade?: number,
  ) {
    const patch =
      lane === 'greeting'
        ? {
            ...copyPatch('koshi'),
            notes: [0, 2, 4, 7, 9],
            tuning: this.config.instrument.tuning,
          }
        : this.config[lane];
    const note: Note = {
      id: this.serial++,
      time: f.time + delay,
      sourceTime: f.time,
      source: f.seq,
      midi,
      velocity: clamp(velocity, 0, 127),
      duration,
      lane,
      patch,
      color: clamp(Math.log1p(f.roughness * 140) / 3),
      pan,
      fade,
    };
    this.events.push({ type: 'note', time: note.time, note });
    return note;
  }
  push(f: Frame) {
    if (this.stopped || (this.previous && f.time <= this.previous.time)) return;
    const first = !this.previous,
      delta = first ? 0 : f.center - this.previous!.center;
    const gap = this.previous && f.time - this.previous.time > 1.5;
    if (first || gap) {
      this.baseline = f.center;
      this.movement = 0;
      this.phrase = 0;
      this.lastLead = -Infinity;
      this.nextLead = -Infinity;
      this.lastPitch = -1;
      this.motif = [];
      this.resetSynth();
    }
    const gesture = this.gesture.push(f);
    // Retain small changes without flattening lively signals at a hard ceiling.
    const motion = 1 - Math.exp(-Math.abs(delta) * 24 - f.roughness * 8),
      detail = 1 - Math.exp(-f.spread * 18);
    const profileScale = Math.max(0.004, f.spread);
    // Absolute level and arrival cadence survive the normalized packet profile.
    // Time-based averaging keeps the mapping independent of analysis frame rate.
    const dt = first || gap ? 0.25 : f.time - this.previous!.time;
    const measured = {
      level: clamp((f.center + 2) / 24),
      pace: 1 / (1 + Math.max(0.001, f.cadence) / 0.12),
      variation: Math.abs(delta) / (Math.abs(delta) + dt * 0.12),
      texture: f.spread / (f.spread + 0.08),
    };
    const follow = first || gap ? 1 : 1 - Math.exp(-dt / 4);
    for (const key of ['level', 'pace', 'variation', 'texture'] as const)
      this.character[key] += (measured[key] - this.character[key]) * follow;
    const character = this.character;
    const profileChange = first
      ? 0
      : f.profile.reduce(
          (sum, x, i) => sum + Math.abs(x - this.previous!.profile[i]),
          0,
        ) /
        (10 * profileScale);
    this.movement += Math.abs(delta) * 12 + Math.min(1, profileChange) * 0.32;
    const bandSum = Math.max(
      0.0001,
      f.spectrum.reduce((sum, x) => sum + x, 0),
    );
    const bands = f.spectrum.map((x) => Math.sqrt(x / bandSum));
    this.events.push({
      type: 'expression',
      time: f.time,
      expression: {
        brightness:
          character.texture * 0.35 +
          character.level * 0.2 + character.variation * 0.25 +
          bands.slice(4).reduce((a, b) => a + b, 0) * 0.08,
        energy: character.variation * 0.4 + character.pace * 0.3 + character.texture * 0.3,
        direction: Math.tanh(f.slope / profileScale),
        bands,
      },
    });
    this.baseline += (f.center - this.baseline) * 0.08;
    const shape =
      f.spectrum.reduce((s, x, i) => s + x * (i + 1), 0) /
      Math.max(
        1e-8,
        f.spectrum.reduce((s, x) => s + x, 0),
      ) /
      9;
    // Capture a motif from the ordered signal, then evolve it gradually.
    // No random seed or species label: identical frames give identical music.
    const position = clamp(0.1 + character.level * 0.65 +
      (character.pace - 0.5) * 0.24 + (shape - 0.5) * 0.22, 0.12, 0.88);
    const contour = Math.tanh((f.center - this.baseline) * 60 + f.slope * 35);
    const leadPool = notePool(this.config.instrument);
    if (!this.motif.length) {
      this.anchor = position;
      this.motif = [0, 2, 5, 8].map((i) =>
        Math.round(Math.tanh(f.profile[i] / profileScale) * (2 + character.texture * 3) +
          Math.sin((i + 1) * (0.5 + character.pace * 2)) * character.variation * 2));
      this.rhythm = [1, 3, 6, 9].map((i) =>
        [0.75, 1, 1.5, 2][Math.min(3, Math.floor(
          (0.5 + 0.5 * Math.tanh(f.profile[i] / profileScale)) * 4))]);
    }
    const step = this.phrase % 4;
    const home = Math.round(this.anchor * (leadPool.length - 1));
    const liveStep = Math.round(Math.tanh(
      (f.profile[(step * 2 + 3) % 10] - f.profile[(step * 2 + 7) % 10]) / profileScale) * 2);
    let index = Math.round(clamp(home + this.motif[step] + liveStep +
      Math.round(contour * 0.7), 0, leadPool.length - 1));
    // Rearticulate a neighbour when the contour stalls, following measured direction.
    if (leadPool[index] === this.lastPitch && step !== 0 && leadPool.length > 1)
      index = Math.round(clamp(index + (liveStep < 0 ? -1 : index < leadPool.length - 1 ? 1 : -1), 0, leadPool.length - 1));
    const previousIndex = this.lastPitch < 0 ? index : leadPool.indexOf(this.lastPitch);
    const lead = leadPool[Math.round(clamp(index,
      Math.max(0, previousIndex - 3), Math.min(leadPool.length - 1, previousIndex + 3)))];
    const velocity = (p: Patch) =>
      clamp(
        p.velocity.center +
          p.velocity.range *
            0.35 *
            Math.tanh(motion + detail + contour * 0.6 - 0.35),
        0,
        127,
      );
    // A local pulse carries a four-note motif. Changes influence the next
    // phrase rather than interrupting it with unrelated notes or echoes.
    const beat = (0.38 + (1 - character.pace) * 0.85 + (1 - character.variation) * 0.2) /
      this.config.speed;
    if (f.time >= this.nextLead) {
      const closing = step === 3;
      const spacing = beat * this.rhythm[step];
      const duration = clamp(spacing * (closing ? 1.3 :
        0.55 + 0.5 * (0.5 + 0.5 * Math.tanh(f.profile[(step * 2 + 1) % 10] / profileScale))),
        0.3 / this.config.speed, 4.5 / this.config.speed);
      const note = this.emit(f, 'instrument', lead, duration,
        velocity(this.config.instrument) * (closing ? 0.8 : step === 0 ? 1 : 0.9),
        -0.12 + Math.tanh(f.slope / profileScale) * 0.12);
      note.reason = closing ? 'phrase-resolution' : step === 0 ? 'signal-motif' : 'motif-contour';
      note.phraseStep = step;
      // A phrase breathes; quiet signals leave wider gaps, active ones answer sooner.
      const rest = closing ? beat * (0.65 + (1 - character.variation) * 1.6) :
        step === 1 && liveStep < 0 ? beat * (1 - character.pace) : 0;
      this.nextLead = f.time + (closing ? Math.max(spacing, duration) : spacing) + rest;
      this.phrase++;
      if (closing) {
        // Only one motif cell mutates at a time; a recognizable memory remains.
        const cell = Math.floor(this.phrase / 4) % 3;
        const measured = Math.round(Math.tanh(f.profile[cell * 3] / profileScale) * 3);
        this.motif[cell] += Math.sign(measured - this.motif[cell]);
        this.rhythm[cell] = [0.75, 1, 1.5, 2][Math.min(3, Math.floor(
          (0.5 + 0.5 * Math.tanh(f.profile[cell * 3 + 1] / profileScale)) * 4))];
        this.anchor += (position - this.anchor) * 0.25;
      }
      this.lastLead = f.time;
      this.lastPitch = lead;
    }
    const voice = synthVoice(this.config.synth.preset);
    const pool = notePool(this.config.synth);
    // The synth forms slow, independent harmonic clouds. Plant detail changes
    // their color continuously without turning pitch into a siren.
    const trace = Math.tanh(
      f.profile.reduce(
        (sum, x, i) =>
          sum + x * Math.sin(((i + 1) * (voice.trace + 1) * Math.PI) / 11),
        0,
      ) /
        (profileScale * 3),
    );
    const rawRegister = clamp(
      0.02 + voice.register * 0.2 + character.level * 0.3 +
        (shape - 0.5) * voice.range * 0.18 +
        trace * (0.06 + character.variation * 0.12) +
        contour * 0.06,
      0.12,
      0.72,
    );
    const stability = this.config.synthMotion.stability / 100;
    const registerSlew = 0.22 - stability * 0.16;
    this.synthRegister =
      this.synthRegister === null
        ? rawRegister
        : this.synthRegister + (rawRegister - this.synthRegister) * registerSlew;
    const scan = (this.synthStep * 3 + voice.trace) % 10;
    const signature = Math.tanh(f.profile[scan] / profileScale);
    const target = pool[0] + this.synthRegister * (pool[pool.length - 1] - pool[0]) +
      signature * (3 + character.texture * 5) +
      (character.pace - 0.5) * 7 + Math.sin(f.center * 0.73) * 3;
    const desiredIndex = pool.reduce(
      (best, n, i) => Math.abs(n - target) < Math.abs(pool[best] - target) ? i : best,
      0,
    );
    const period =
      ((1.8 + stability * 1.8 + (1 - character.pace) * 2 + (1 - character.variation)) * (0.78 + voice.pace * 0.08)) /
      this.config.speed;
    if (f.time >= this.nextSynth) {
      const currentIndex = this.synthPitch < 0
        ? desiredIndex
        : pool.reduce(
            (best, n, i) => Math.abs(n - this.synthPitch) < Math.abs(pool[best] - this.synthPitch) ? i : best,
            0,
          );
      const rootIndex = Math.round(clamp(desiredIndex, currentIndex - 2, currentIndex + 2));
      const root = pool[rootIndex];
      const interval = [7, 4, 3, 5][Math.min(3, Math.floor(
        (0.5 + 0.5 * Math.tanh(f.profile[(scan + 4) % 10] / profileScale)) * 4))];
      const companionTarget = root + interval <= pool[pool.length - 1] ? root + interval : root - interval;
      const companion = pool.reduce(
        (best, n) => n !== root && Math.abs(n - companionTarget) < Math.abs(best - companionTarget) ? n : best,
        pool.find((n) => n !== root) ?? root,
      );
      const fade = Math.min(period * 0.65, this.config.synthMotion.transition / this.config.speed);
      const synthVelocity = velocity(this.config.synth);
      // Renew alternating layers, keeping the other layer as a tonal reference.
      const upper = this.synthStep % 2 === 1;
      const note = this.emit(f, 'synth', upper ? companion : root, period * 1.25,
        synthVelocity * (upper ? 0.34 : 0.5), upper ? 0.22 : -0.22, 0, fade);
      note.reason = upper ? 'signal-upper-layer' : 'signal-root-layer';
      note.phraseStep = this.synthStep % 4;
      this.synthPitch = root;
      this.lastSynth = f.time;
      this.nextSynth = f.time + period;
      this.synthStep++;
    }
    if (gesture) this.greet(f, lead);
    this.previous = f;
  }
  private greet(f: Frame, lead: number) {
    const tubes = [60, 62, 64, 67, 69];
    const start = Math.abs(Math.round(f.center)) % tubes.length;
    const times = [0, 0.22, 0.57];
    for (let j = 0; j < times.length; j++) {
      const note = this.emit(f, 'greeting', tubes[(start + j * 2) % tubes.length],
        1.15, 66 - j * 9, Math.sin(j * 2.1) * 0.4,
        times[j] * (0.85 + this.character.pace * 0.3));
      note.reason = 'wind-chime';
    }
  }
  advance(time: number) {
    if (this.previous && time - this.previous.time > 1.5) {
      this.events.push({ type: 'release', time });
      this.previous = null;
    }
  }
  finish(time: number) {
    this.stopped = true;
    this.events.push({ type: 'release', time });
  }
  audition(lane: Lane, time: number) {
    const f: Frame = {
      time,
      seq: -1,
      center: 14,
      level: 20000,
      spread: 0.02,
      roughness: 0.01,
      slope: 0,
      spectrum: Array(9).fill(0.01),
      profile: Array(10).fill(0),
      cadence: 0,
    };
    const patch = lane === 'synth' ? this.config.synth : this.config.instrument,
      pool = notePool(
        lane === 'greeting' ? { ...patch, octaves: [4, 5] } : patch,
      ),
      at = Math.floor(pool.length * 0.55);
    if (lane === 'greeting') {
      this.greet(f, pool[at] - 7);
      return;
    }
    if (lane === 'synth') {
      const root = pool[at];
      const companion = pool.reduce(
        (best, n) => n !== root && Math.abs(n - (root + 7)) < Math.abs(best - (root + 7)) ? n : best,
        pool.find((n) => n !== root) ?? root,
      );
      const fade = Math.min(2.4, this.config.synthMotion.transition);
      this.emit(f, lane, root, 4.8, 78, -0.16, 0, fade);
      if (companion !== root) this.emit(f, lane, companion, 4.8, 46, 0.16, 0, fade);
      return;
    }
    for (let j = 0; j < 3; j++)
      this.emit(
        f,
        lane,
        pool[Math.min(pool.length - 1, at + j * 2)],
        2.8,
        95,
        (j - 1) * 0.2,
        j * 0.45,
      );
  }
  drain() {
    const result = this.events;
    this.events = [];
    return result;
  }
  get latest() {
    return this.previous;
  }
}
export function createSoundscape(
  analysis: Analysis,
  config = defaultConfiguration(),
): Soundscape {
  const c = new Composer(config),
    events: Event[] = [];
  for (const frame of analysis.frames) {
    c.advance(frame.time);
    c.push(frame);
    events.push(...c.drain());
  }
  c.finish(
    Math.min(analysis.duration, (analysis.frames.at(-1)?.time ?? 0) + 0.4),
  );
  events.push(...c.drain());
  events.sort((a, b) => a.time - b.time);
  return {
    config: sanitizeConfiguration(config),
    duration: analysis.duration,
    events,
    notes: events
      .filter((e): e is Extract<Event, { type: 'note' }> => e.type === 'note')
      .map((e) => e.note),
  };
}
export const noteName = (midi: number) =>
  ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][
    ((Math.round(midi) % 12) + 12) % 12
  ] +
  (Math.floor(midi / 12) - 1);
