import { soundSlots, notePool, preset, greetingPatch, type Configuration, type SoundSlot } from '../presets.ts';
import { clamp, type Frame } from '../signal.ts';
import type { Event, Lane } from '../music-types.ts';
import type { MusicalIntent } from '../intent.ts';

type Phrase = {
  length: number; pulses: number; rotation: number; home: number;
  motif: number[]; activity: number; swing: number; beat: number; generation: number;
};
const wrap = (n: number, size: number) => ((n % size) + size) % size;
const pulse = (step: number, count: number, length: number, rotation = 0) =>
  wrap((step + rotation) * count, length) < count;
const closest = (pool: number[], target: number) => pool.reduce((a, b) =>
  Math.abs(b - target) < Math.abs(a - target) ? b : a);

/** Build only consonant combinations available in THIS slot's independent scale. */
function voicing(pool: number[], root: number, count: number, previous: number[]) {
  const notes = [root];
  const consonant = (a: number, b: number) => [0, 3, 4, 5, 7, 8, 9].includes(wrap(a - b, 12));
  for (let voice = 1; voice < count; voice++) {
    const candidates = pool.filter((n) => !notes.includes(n) && Math.abs(n - root) <= 16 &&
      notes.every((other) => Math.abs(n - other) >= 3 && consonant(n, other)));
    if (!candidates.length) break;
    // Prefer small movements from the previous cloud, then an open third/fifth.
    const target = previous[voice] ?? root + (voice === 1 ? 7 : 4);
    notes.push(closest(candidates, target));
  }
  return notes;
}

/** Slot-based director: slow harmonic clouds or a percussion/wind conversation. */
export class EnsembleRules {
  private events: Event[] = [];
  private next = new Map<string, number>();
  private steps = new Map<string, number>();
  private phrases = new Map<string, Phrase>();
  private harmony = new Map<string, number[]>();
  private previousPitch = new Map<string, number>();
  private stopped = false;
  private config: Configuration;
  private style: 'mist' | 'grove';
  constructor(config: Configuration, style: 'mist' | 'grove') {
    this.config = config;
    this.style = style;
  }
  configure(config: Configuration, time: number) {
    for (const slot of soundSlots(config)) {
      const old = soundSlots(this.config).find((s) => s.id === slot.id);
      if (JSON.stringify(old?.patch) !== JSON.stringify(slot.patch)) {
        this.events.push({ type: 'release', time, slot: slot.id });
        this.next.delete(slot.id);
        this.phrases.delete(slot.id);
        this.harmony.delete(slot.id);
        this.previousPitch.delete(slot.id);
        this.steps.delete(slot.id);
      }
    }
    this.config = config;
  }
  private note(slot: SoundSlot, f: Frame, time: number, midi: number, duration: number,
    velocity: number, pan: number, fade?: number, greeting = false,
    reason?: string, articulation?: number) {
    // Articulation is transient; never rewrite the user's envelope or enable an effect.
    const patch = articulation === undefined || !slot.patch.envelope.on ? slot.patch : {
      ...slot.patch, envelope: { ...slot.patch.envelope,
        attack: slot.patch.envelope.attack * articulation,
        release: Math.min(slot.patch.envelope.release, 12 + articulation * 20) },
    };
    this.events.push({ type: 'note', time, note: {
      id: 0, time, sourceTime: f.time, source: f.seq, midi, duration,
      velocity: clamp(velocity, 0, 127), pan: clamp(pan, -1, 1), fade,
      color: 0.4, lane: greeting ? 'greeting' : slot.kind,
      slot: greeting ? '$greeting' : slot.id,
      patch: greeting ? greetingPatch(slot.patch) : patch,
      reason: greeting ? 'mood-greeting' : `${this.style}-${reason ?? slot.id}`,
      phraseStep: (this.steps.get(slot.id) ?? 0) % (this.phrases.get(slot.id)?.length ?? 8),
    } });
  }
  private phrase(slot: SoundSlot, intent: MusicalIntent, pool: number[]): Phrase {
    const { character: c, fingerprint: f } = intent;
    const old = this.phrases.get(slot.id);
    const generation = (old?.generation ?? -1) + 1;
    const response = this.config.plantResponse ?? 1;
    const activity = clamp(c.variation * 0.4 + (1 - f.cadence) * 0.4 + f.entropy * 0.2);
    const length = f.asymmetry < -0.25 ? 12 : 16;
    const home = Math.round(clamp(0.5 + (c.level - 0.5) * 0.7 * response +
      (intent.shape - 0.5) * 0.25 * response, 0.12, 0.83) * (pool.length - 1));
    const spread = 1 + Math.round(c.texture * 3 + f.entropy * 2);
    const measured = intent.frame.profile.filter((_, i) => i % 2 === generation % 2)
      .map((x) => Math.round(Math.tanh(x / intent.profileScale) * spread));
    // Keep a recognizable motif; new signal changes its ending, not every note.
    const motif = !old || f.novelty > 0.5 ? measured :
      old.motif.map((n, i) => i < 2 ? n : measured[i]);
    const result = { length, home, motif, generation, activity,
      pulses: Math.round(3 + activity * (length / 2 - 3)),
      rotation: Math.round((f.asymmetry + 1) * 3 + intent.shape * 4),
      swing: f.irregularity * 0.2,
      beat: (0.26 + f.cadence * 0.27) / this.config.speed };
    this.phrases.set(slot.id, result);
    return result;
  }
  tick(intent: MusicalIntent, time: number) {
    if (this.stopped) return;
    const { character: c, frame, fingerprint: f } = intent;
    for (const [i, slot] of soundSlots(this.config).entries()) {
      if (time < (this.next.get(slot.id) ?? -Infinity)) continue;
      const step = this.steps.get(slot.id) ?? 0, pool = notePool(slot.patch);
      if (!pool.length) continue;
      let phrase = this.phrases.get(slot.id);
      if (!phrase || step % (slot.kind === 'synth' ? 4 : phrase.length) === 0)
        phrase = this.phrase(slot, intent, pool);
      const p = phrase, cell = step % p.length;
      const beat = p.beat;
      const sample = Math.tanh(frame.profile[(cell + i * 3) % frame.profile.length] / intent.profileScale);
      const velocity = clamp(slot.patch.velocity.center + slot.patch.velocity.range *
        ((p.activity - 0.5) * 0.45 + sample * 0.2), 18, 120);
      if (slot.kind === 'synth') {
        const motion = slot.motion ?? this.config.synthMotion;
        const cycle = step % 4;
        const direction = intent.contour < 0 ? -1 : 1;
        // Departure, expansion, suspension, return; offsets come from the plant motif.
        const degree = cycle === 3 ? 0 : p.motif[cycle] + direction * cycle;
        const root = pool[Math.round(clamp(p.home + degree, 0, pool.length - 1))];
        const period = beat * (this.style === 'mist' ? 9 + motion.stability / 25 : 12);
        const previous = this.harmony.get(slot.id) ?? [];
        const pitches = voicing(pool, root, this.style === 'mist' && f.entropy > 0.45 ? 3 : 2, previous);
        this.harmony.set(slot.id, pitches);
        const breathing = cycle === 3 ? 0.62 : 0.92;
        pitches.forEach((midi, j) => {
          const delay = j * beat * (0.35 + c.texture * 0.7);
          this.note(slot, frame, time + delay, midi, period * breathing - delay,
            velocity * (j ? 0.3 : 0.43), (j - (pitches.length - 1) / 2) * 0.38,
            Math.min(period * 0.25, motion.transition), false,
            cycle === 3 ? 'harmonic-return' : 'voiced-cloud');
        });
        // A brief solo answer instead of yet another sustained chord layer.
        if (this.style === 'mist' && cycle === 1 && p.activity > 0.4) {
          const midi = closest(pool, root + (f.asymmetry > 0 ? 12 : 7));
          this.note(slot, frame, time + period * 0.6, midi, beat * 1.8,
            velocity * 0.28, sample * 0.4, beat * 0.45, false, 'cloud-answer');
        }
        this.next.set(slot.id, time + period);
      } else if (preset(slot.patch.preset).family === 'percussion') {
        const hit = pulse(cell, p.pulses, p.length, p.rotation);
        // A sparser counter-cell adds cross-rhythm only when the plant is active.
        const ghost = !hit && p.activity > 0.55 && pulse(cell, 2, 7, p.generation % 7);
        const closingRest = cell >= p.length - 2 && p.generation % 2 === 1;
        if ((hit || ghost) && !closingRest) {
          const position = Math.round(clamp(p.home + p.motif[cell % p.motif.length] + sample * 2, 0, pool.length - 1));
          this.note(slot, frame, time, pool[position], beat * (ghost ? 0.35 : 0.8),
            velocity * (ghost ? 0.4 : cell % 4 === 0 ? 1 : 0.77), -0.25 + sample * 0.12,
            undefined, false, ghost ? 'cross-rhythm-ghost' : 'signal-pulse', 0.25);
        }
        this.next.set(slot.id, time + beat * (1 + (cell % 2 ? -p.swing : p.swing)));
      } else {
        const answer = cell >= p.length / 2;
        const count = Math.round(3 + p.activity * 3);
        const onset = pulse(cell, count, p.length - 2, p.rotation + 2);
        // Two final cells always breathe. Other rests depend on the signal's density.
        if (cell < p.length - 2 && onset) {
          const motifStep = wrap(answer ? p.motif.length - 1 - cell : cell, p.motif.length);
          const inversion = answer && intent.contour < 0 ? -1 : 1;
          const degree = cell >= p.length - 4 ? 0 : p.motif[motifStep] * inversion;
          const target = pool[Math.round(clamp(p.home + degree, 0, pool.length - 1))];
          const previous = this.previousPitch.get(slot.id);
          const nearby = previous === undefined ? pool : pool.filter((n) => Math.abs(n - previous) <= 7);
          const midi = closest(nearby.length ? nearby : pool, target);
          this.previousPitch.set(slot.id, midi);
          let space = 1;
          while (cell + space < p.length - 2 && !pulse(cell + space, count, p.length - 2, p.rotation + 2)) space++;
          const legato = sample > 0 || cell >= p.length - 4;
          const duration = beat * Math.min(space * (legato ? 0.86 : 0.48), 3);
          this.note(slot, frame, time, midi, duration, velocity * (answer ? 0.86 : 0.96),
            0.22 + f.asymmetry * 0.12, undefined, false,
            cell >= p.length - 4 ? 'motif-resolution' : answer ? 'motif-answer' : 'motif-question', legato ? 0.8 : 0.3);
          // An occasional measured gesture produces a short neighbouring ornament.
          if (f.novelty > 0.55 && space >= 2 && cell % 4 === 0) {
            const neighbor = pool[Math.round(clamp(pool.indexOf(midi) + (intent.contour < 0 ? -1 : 1), 0, pool.length - 1))];
            if (neighbor !== midi) this.note(slot, frame, time + beat * 0.65, neighbor,
              beat * 0.4, velocity * 0.48, 0.3, undefined, false, 'signal-ornament', 0.15);
          }
        }
        this.next.set(slot.id, time + beat * (1 + (cell % 2 ? -p.swing : p.swing)));
      }
      this.steps.set(slot.id, step + 1);
    }
  }
  greet(frame: Frame) {
    const slots = soundSlots(this.config);
    const slot = slots.find((s) => preset(s.patch.preset).family === 'wind') ?? slots.find((s) => s.kind === 'instrument') ?? slots[0];
    const pool = notePool(slot.patch), at = Math.floor(pool.length * 0.6);
    [0, 0.14, 0.3].forEach((delay, j) => this.note(slot, frame, frame.time + delay,
      pool[Math.min(pool.length - 1, at + j * 2)], 0.8, 65 - j * 7, (j - 1) * 0.2, undefined, true));
  }
  audition(lane: Lane, time: number, slotId?: string) {
    const frame: Frame = { time, seq: -1, center: 14, level: 0, spread: 0, roughness: 0, slope: 0,
      spectrum: Array(9).fill(0), profile: Array(10).fill(0), cadence: 0 };
    if (lane === 'greeting') { this.greet(frame); return; }
    const slot = soundSlots(this.config).find((s) => slotId ? s.id === slotId : s.kind === lane);
    if (!slot) return;
    const pool = notePool(slot.patch);
    this.note(slot, frame, time, pool[Math.floor(pool.length * 0.55)], lane === 'synth' ? 3 : 1, 72, 0, lane === 'synth' ? 1 : undefined);
  }
  finish(time: number) { this.stopped = true; this.events.push({ type: 'release', time }); }
  drain() { const events = this.events; this.events = []; return events; }
}
