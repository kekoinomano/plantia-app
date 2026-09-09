import { clamp, GAP_SECONDS, type Frame } from '../signal.ts';
import { synthVoice } from '../synth-voices.ts';
import { defaultConfiguration, sanitizeConfiguration, notePool, greetingPatch, preset, type Configuration, type Patch } from '../presets.ts';
import type { Lane, Note, Event } from '../music-types.ts';
import type { MusicalIntent } from '../intent.ts';
/** No transport, audio API, database or species identity. Receives descriptors, emits a small note protocol. */
export class OrganicRules {
  private config: Configuration;
  private events: Event[] = [];
  private previous: Frame | null = null;
  private serial = 0;
  private lastLead = -Infinity;
  private lastSynth = -Infinity;
  private synthPitch = -1;
  private synthRegister: number | null = null;
  private lastPitch = -1;
  private stopped = false;
  private phrase = 0;
  private nextLead = -Infinity;
  private nextSynth = -Infinity;
  private motif: number[] = [];
  private rhythm: number[] = [];
  private anchor = 0;
  private synthStep = 0;
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
        ? greetingPatch(this.config.instrument)
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
  tick(intent: MusicalIntent, time: number) {
    if (this.stopped || time < this.nextLead && time < this.nextSynth) return;
    const { character, motion, detail, profileScale, shape, contour, position } = intent;
    const f = { ...intent.frame, time };
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
    if (f.time >= this.nextSynth) this.synthRegister =
      this.synthRegister === null
        ? rawRegister
        : this.synthRegister + (rawRegister - this.synthRegister) * registerSlew;
    const scan = (this.synthStep * 3 + voice.trace) % 10;
    const signature = Math.tanh(f.profile[scan] / profileScale);
    const target = pool[0] + (this.synthRegister ?? rawRegister) * (pool[pool.length - 1] - pool[0]) +
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
    this.previous = f;
  }
  greet(f: Frame, lead = this.lastPitch > 0 ? this.lastPitch : 60) {
    const hits = preset(this.config.instrument.preset).percussion;
    if (hits) {
      [0, 0.12, 0.27].forEach((delay, j) => {
        const note = this.emit(f, 'greeting', hits[(j + Math.abs(f.seq)) % hits.length],
          0.65, [72, 62, 66][j], (j - 1) * 0.2, delay);
        note.reason = 'percussion-greeting';
      });
      return;
    }
    // Keep the selected pitch classes, but lift the response into a bright register.
    const pool = notePool({ ...this.config.instrument, octaves: [3, 7] }).sort((a, b) => a - b);
    if (!pool.length) return;
    const target = clamp(lead + 5, 60, 78);
    const root = pool.reduce((a, b) => Math.abs(b - target) < Math.abs(a - target) ? b : a);
    const upper = pool.filter((n) => n > root && n <= root + 24);
    const tension = (interval: number) => [1, 2, 6, 10, 11].includes(interval % 12) ? 12 : 0;
    let chord = [root, root + 12, root + 24], best = Infinity;
    for (let i = 0; i < upper.length; i++) {
      for (let j = i + 1; j < upper.length; j++) {
        const a = upper[i] - root, b = upper[j] - root;
        const score = Math.abs(a - 4) + Math.abs(b - 7) +
          tension(a) + tension(b) + tension(b - a);
        if (score < best) { best = score; chord = [root, upper[i], upper[j]]; }
      }
    }
    chord.forEach((midi, j) => {
      const note = this.emit(f, 'greeting', midi, 0.7 + j * 0.075,
        [72, 65, 60][j], [-0.2, 0, 0.2][j], [0, 0.12, 0.27][j]);
      note.reason = 'instrument-greeting';
    });
  }
  /* Alternative wind-chime greeting, retained for future comparison.
     Requires the koshi patch, sample bypass and the commented DSP chime override.
  private greetChimes(f: Frame, lead: number) {
    const tubes = [84, 86, 88, 91, 93];
    const start = Math.abs(Math.round(f.center)) % tubes.length;
    // A small gust: uneven, overlapping strikes rather than a played melody.
    const times = [0, 0.09, 0.21, 0.27, 0.43, 0.58];
    const strikes = [0, 2, 4, 1, 3, 2];
    const velocities = [54, 40, 47, 32, 37, 25];
    for (let j = 0; j < times.length; j++) {
      const note = this.emit(f, 'greeting', tubes[(start + strikes[j]) % tubes.length],
        0.95, velocities[j], Math.sin(j * 2.1) * 0.45, times[j]);
      note.reason = 'wind-chime';
    }
  }
  */
  advance(time: number) {
    if (this.previous && time - this.previous.time > GAP_SECONDS) {
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
