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
const fraction = (n: number) => n - Math.floor(n);
/** No transport, audio API, database or species identity. Receives descriptors, emits a small note protocol. */
export class Composer {
  private config: Configuration;
  private gesture = createGestureDetector();
  private events: Event[] = [];
  private previous: Frame | null = null;
  private serial = 0;
  private lastLead = -Infinity;
  private lastSynth = -Infinity;
  private baseline = 0;
  private lastPitch = -1;
  private stopped = false;
  private movement = 0;
  private phrase = 0;
  constructor(config = defaultConfiguration()) {
    this.config = sanitizeConfiguration(config);
  }
  configure(config: Configuration, time: number) {
    this.config = sanitizeConfiguration(config);
    this.events.push(
      { type: 'release', time, lane: 'synth' },
      { type: 'release', time, lane: 'instrument' },
    );
    this.lastLead = this.lastSynth = -Infinity;
  }
  private emit(
    f: Frame,
    lane: Lane,
    midi: number,
    duration: number,
    velocity: number,
    pan: number,
    delay = 0,
  ) {
    const patch =
      lane === 'greeting'
        ? {
            ...copyPatch('harp'),
            notes: [...this.config.instrument.notes],
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
      this.lastLead = this.lastSynth = -Infinity;
    }
    const gesture = this.gesture.push(f);
    // Retain small changes without flattening lively signals at a hard ceiling.
    const motion = 1 - Math.exp(-Math.abs(delta) * 24 - f.roughness * 8),
      detail = 1 - Math.exp(-f.spread * 18);
    const profileScale = Math.max(0.004, f.spread);
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
          detail * 0.5 +
          motion * 0.3 +
          bands.slice(4).reduce((a, b) => a + b, 0) * 0.08,
        energy: motion * 0.55 + detail * 0.45,
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
    const position = fraction(f.center * 0.38196601125 + shape * 0.43);
    const contour = Math.tanh((f.center - this.baseline) * 60 + f.slope * 35);
    const leadPool = notePool(this.config.instrument);
    const profileAt = Math.floor(this.phrase % f.profile.length);
    const detailStep =
      Math.tanh(
        (f.profile[profileAt] - f.profile[(profileAt + 4) % 10]) / profileScale,
      ) * 2.4;
    const index = Math.round(
      (0.28 + position * 0.64) * (leadPool.length - 1) +
        contour * 2 +
        detailStep,
    );
    const lead = leadPool[Math.round(clamp(index, 0, leadPool.length - 1))];
    const velocity = (p: Patch) =>
      clamp(
        p.velocity.center +
          p.velocity.range *
            0.35 *
            Math.tanh(motion + detail + contour * 0.6 - 0.35),
        0,
        127,
      );
    // Pace follows fresh measurements even when motion is small; quiet plants still have articulate notes.
    const leadPeriod =
      (1.05 +
        (1 - detail) * 0.75 +
        (1 - motion) * 0.35 +
        (1 - Math.min(1, profileChange)) * 0.25) /
      this.config.speed;
    if (
      f.time - this.lastLead >= leadPeriod ||
      (Math.abs(lead - this.lastPitch) >= 5 &&
        f.time - this.lastLead > 0.35 / this.config.speed)
    ) {
      this.emit(
        f,
        'instrument',
        lead,
        (1.1 + detail * 0.9) / this.config.speed,
        velocity(this.config.instrument),
        -0.12 + f.slope * 0.4,
      );
      // A measured change opens a short response from another part of this packet.
      // Stable input does not acquire an unrelated random tune.
      if (this.movement > 0.65 && !gesture && !this.gesture.engaged) {
        const responseStep = Math.round(
          Math.tanh(f.profile[(profileAt + 6) % 10] / profileScale) * 3,
        );
        const reply =
          leadPool[
            Math.round(clamp(index + responseStep, 0, leadPool.length - 1))
          ];
        if (reply !== lead)
          this.emit(
            f,
            'instrument',
            reply,
            (0.7 + detail * 0.8) / this.config.speed,
            velocity(this.config.instrument) * 0.68,
            0.2 + Math.tanh(f.slope / profileScale) * 0.2,
            (0.32 + (1 - motion) * 0.3) / this.config.speed,
          );
        this.phrase += 1 + Math.min(2, Math.floor(this.movement));
        this.movement %= 0.65;
      }
      this.lastLead = f.time;
      this.lastPitch = lead;
    }
    const voice = synthVoice(this.config.synth.preset);
    const synthPeriod =
      (voice.pace * (1.05 + (1 - detail) * 0.25 + (1 - motion) * 0.15)) /
      this.config.speed;
    if (f.time - this.lastSynth >= synthPeriod) {
      const pool = notePool(this.config.synth);
      // Each sound follows a different projection of the ordered packet. The full scale remains available.
      const trace = Math.tanh(
        f.profile.reduce(
          (sum, x, i) =>
            sum + x * Math.sin(((i + 1) * (voice.trace + 1) * Math.PI) / 11),
          0,
        ) /
          (profileScale * 3),
      );
      const register = clamp(
        voice.register +
          (position - 0.5) * voice.range +
          trace * 0.15 +
          contour * 0.08,
        0.05,
        0.95,
      );
      const target = pool[0] + register * (pool[pool.length - 1] - pool[0]);
      const nearest = (target: number, candidates: number[]) =>
        candidates.reduce(
          (best, n) =>
            Math.abs(n - target) < Math.abs(best - target) ? n : best,
          candidates[0],
        );
      const root = nearest(target, pool);
      const dominant = bands.reduce(
        (best, x, i) => (x > bands[best] ? i : best),
        0,
      );
      const interval = voice.intervals[dominant % voice.intervals.length];
      const companionTarget =
        root + interval <= pool[pool.length - 1]
          ? root + interval
          : root - interval;
      const others = pool.filter((n) => n !== root);
      const companion = others.length ? nearest(companionTarget, others) : root;
      this.emit(
        f,
        'synth',
        root,
        (voice.sustain * (0.85 + detail * 0.3)) / this.config.speed,
        velocity(this.config.synth) * 0.8,
        -0.32,
      );
      if (companion !== root)
        this.emit(
          f,
          'synth',
          companion,
          (voice.sustain * (0.95 + motion * 0.2)) / this.config.speed,
          velocity(this.config.synth) * 0.64,
          0.32,
          (voice.response + (1 - motion) * 0.18) / this.config.speed,
        );
      this.lastSynth = f.time;
    }
    if (gesture) this.greet(f, lead);
    this.previous = f;
  }
  private greet(f: Frame, lead: number) {
    const pool = notePool({
      ...this.config.instrument,
      octaves: [4, 5],
    }).filter((n) => n <= 79);
    const closest = pool.reduce(
      (best, n, i) =>
        Math.abs(n - (lead + 7)) < Math.abs(pool[best] - (lead + 7)) ? i : best,
      0,
    );
    const at = Math.max(0, Math.min(pool.length - 3, closest));
    // One unfolding gesture: a soft bloom, followed by its quieter, spacious reflection.
    this.emit(f, 'greeting', pool[at], 3.4, 100, -0.3);
    this.emit(
      f,
      'greeting',
      pool[Math.min(pool.length - 1, at + 2)],
      3,
      82,
      0.3,
      0.68,
    );
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
