import type { PlantPacket } from '../plant-packet';
import { preset, SCALES, type Configuration, type Patch } from '../sonora/presets';
import type { Event } from '../sonora/music-types';
import { GreetingDetector, type RawGreeting } from './greeting';
import { WaveAnalyzer } from './analyzer';
import { clamp, type WaveFrame } from './features';
import type { WaveBar, WaveMood, WaveNote } from './types';
import { musicalField } from './musical-field';
import type { WaveInspection, WindowReadout } from './inspection';

const FRESH_SECONDS = 6;
const LOOKAHEAD = 0.18;

/** Common transport for wave moods. It knows about musical time and note
 * delivery, but all harmony, density, instruments and mappings belong to a mood. */
export class WaveComposer {
  private analyzer: WaveAnalyzer;
  private rules: ReturnType<WaveMood['create']>;
  private frame: WaveFrame | null = null;
  private barFrame: WaveFrame | null = null;
  private bar: WaveBar | null = null;
  private barStart = 0;
  private step = 0;
  private clock = 0;
  private lastPacket = -Infinity;
  private events: Event[] = [];
  private serial = 0;
  private revision = 0;
  private closed = false;
  private sounding = false;
  private resumeAt = 0;
  private decision = 'waiting-for-3-seconds';
  private greetingDetector = new GreetingDetector();
  private greetingUntil = 0;
  private lastGreeting: RawGreeting | null = null;
  private greetingCount = 0;

  private patch(presetId: string, slot: string): Patch {
    const patch = this.mood.patch(presetId, slot);
    if (preset(presetId).percussion) return patch;
    return { ...patch, scale: this.config.scale, notes: [...SCALES[this.config.scale]], tuning: this.config.tuning };
  }

  /** Keep the plant-selected tonal centre, but remap the mood degree into the edited scale. */
  private midi(midi: number) {
    const selected = SCALES[this.config.scale];
    const original = this.mood.profile.notes;
    const tonic = typeof this.bar?.summary.tonic === 'number' ? this.bar.summary.tonic : (this.mood.profile.tonic ?? 0);
    if (!selected?.length || !original.length) return midi;
    const relative = (midi - tonic + 120) % 12;
    let degree = 0, distance = Infinity;
    original.forEach((pitch, index) => {
      const next = Math.min((pitch - relative + 12) % 12, (relative - pitch + 12) % 12);
      if (next < distance) { distance = next; degree = index; }
    });
    const mapped = selected[Math.round(degree * (selected.length - 1) / Math.max(1, original.length - 1))];
    const targetClass = (tonic + mapped) % 12;
    let result = midi + ((targetClass - midi + 18) % 12 - 6);
    if (result - midi === -6) result += 12;
    return result;
  }

  constructor(private config: Configuration, private mood: WaveMood,
    private ready: () => void, fail: (error: unknown) => void) {
    this.rules = mood.create();
    this.analyzer = new WaveAnalyzer(frame => {
      if (this.closed) return;
      this.frame = frame; this.revision++;
      if (!frame) this.release('waiting-for-complete-windows');
      this.ready();
    }, fail);
  }

  push(packet: PlantPacket, now: number) {
    if (this.closed) return false;
    this.clock = Math.max(this.clock, now);
    const valid = !packet.error && packet.values?.length === 10 && Number.isSafeInteger(packet.seq) &&
      packet.values.every(v => Number.isSafeInteger(v) && v > 0 && v <= 5_000_000);
    if (valid) this.lastPacket = now;
    // Validate raw extremes before any grouping/FFT can erase their shape.
    const greeting = this.greetingDetector.push(packet, now);
    if (greeting) this.greet(greeting, now);
    const collectedBefore = Math.floor(this.analyzer.collectedSeconds);
    this.analyzer.push(valid ? packet : { ...packet, error: packet.error ?? 'Paquete no válido para el análisis de ondas' }, now);
    if (!this.frame && collectedBefore !== Math.floor(this.analyzer.collectedSeconds)) this.revision++;
    return !!valid;
  }

  private greet(event: RawGreeting, now: number) {
    const phrase = this.rules.greet?.(event);
    if (!phrase) return;
    const releaseAt = now + LOOKAHEAD + .02;
    const start = releaseAt + .16;
    for (const slot of ['contour', 'detail']) this.events.push({ type: 'release', time: releaseAt, slot });
    this.greetingUntil = start + phrase.holdSeconds;
    this.lastGreeting = event; this.greetingCount++; this.revision++;
    for (const item of phrase.notes) {
      const slot = this.config.slots?.find(s => s.id === item.slot);
      if (!slot || slot.level <= 0) continue;
      const patch = this.patch(item.preset, item.slot);
      patch.envelope = { on: true, attack: item.attack, release: item.release };
      const time = start + item.after;
      this.events.push({ type: 'note', time, note: {
        id: this.serial++, time, sourceTime: event.time, source: event.sequence, midi: this.midi(item.midi),
        velocity: item.velocity, duration: item.duration, lane: slot.kind, slot: slot.id, patch,
        pan: item.pan, color: item.color, reason: item.rule, rawGreeting: event,
      } });
    }
  }

  configure(config: Configuration, time: number) { this.config = config; this.clock = Math.max(this.clock, time); }

  private release(reason: string) {
    if (this.sounding || this.bar || this.greetingUntil > this.clock) {
      // Also release any attacks already sent within the bounded lookahead.
      this.resumeAt = this.clock + LOOKAHEAD + 0.1;
      this.events.push({ type: 'release', time: this.clock }, { type: 'release', time: this.resumeAt });
    }
    this.sounding = false; this.bar = null; this.barFrame = null; this.step = 0;
    this.decision = reason; this.rules.reset(); this.greetingUntil = 0;
  }

  advance(now: number) {
    if (this.closed) return;
    this.clock = Math.max(this.clock, now);
    if (now < this.resumeAt) return;
    const frame = this.frame;
    // Android can defer analyzer callbacks while backgrounded even though BLE
    // packets and the native PCM queue remain healthy. Reuse the last valid
    // analysis while fresh plant samples continue to arrive.
    if (!frame || now - this.lastPacket > FRESH_SECONDS) {
      if (this.bar || this.sounding) { this.release('stale-analysis'); this.revision++; }
      return;
    }
    if (!frame.short.waves.length || !frame.long.waves.length) {
      if (this.bar || this.sounding) { this.release('constant-window'); this.revision++; }
      return;
    }
    // A stalled scheduler starts a fresh bar; it never drains missed beats.
    if (this.bar && now > this.barStart + this.bar.beats * 60 / this.bar.bpm + LOOKAHEAD) {
      this.bar = null; this.barFrame = null; this.step = 0;
    }
    if (!this.bar) this.beginBar(now, frame);
    const bar = this.bar!;
    const beat = 60 / bar.bpm;
    const steps = bar.beats * bar.stepsPerBeat;
    const swingUnit = bar.swingUnit ?? 1;
    for (; this.step < steps; this.step++) {
      const time = this.barStart + this.step * beat / bar.stepsPerBeat +
        (Math.floor(this.step / swingUnit) % 2 ? bar.swing * beat * swingUnit / bar.stepsPerBeat : 0);
      if (time > now + LOOKAHEAD) break;
      if (time < now - 0.06) continue;
      for (const note of bar.notes) if (note.step === this.step) this.emit(note, time, beat);
    }
    const end = this.barStart + bar.beats * beat;
    if (this.step === steps && now + LOOKAHEAD >= end) {
      this.beginBar(end, frame);
      // Step zero is delivered on the next scheduler visit, still within the
      // lookahead horizon; no recursion and no backlog after an OS pause.
    }
  }

  private beginBar(time: number, frame: WaveFrame) {
    this.bar = this.rules.arrange(frame); this.barFrame = frame;
    this.barStart = time; this.step = 0; this.revision++;
    this.decision = this.bar.notes.length ? 'wave-bar' : this.bar.summary.breathing && !this.bar.summary.quiet
      ? 'arranged-rest' : 'measured-rest';
    if (!this.bar.notes.length && this.sounding && !this.bar.summary.sustain) {
      this.events.push({ type: 'release', time }); this.sounding = false;
    }
    this.events.push({ type: 'expression', time, expression: this.bar.expression });
  }

  private emit(note: WaveNote, time: number, beat: number) {
    const frame = note.sourceFrame ?? this.barFrame;
    const slot = this.config.slots?.find(s => s.id === note.slot);
    if (!frame || !slot || slot.level <= 0) return;
    if ((note.slot === 'contour' || note.slot === 'detail') && time < this.greetingUntil) return;
    const window = frame[note.window];
    const patch = this.patch(note.preset, note.slot);
    patch.envelope = { on: true, attack: note.attack, release: note.release };
    const at = Math.max(this.clock, time) + (note.offset ?? 0);
    this.events.push({ type: 'note', time: at, note: {
      id: this.serial++, time: at, sourceTime: frame.arrival, source: frame.sequence,
      signalTime: window.end, midi: this.midi(note.midi), velocity: clamp(note.velocity, 1, 110),
      duration: Math.max(0.04, note.beats * beat), lane: slot.kind, slot: note.slot,
      patch, pan: note.pan, color: note.color, reason: note.rule,
      wave: { analysis: frame.id, windowSeconds: window.fit.seconds, start: window.start, end: window.end,
        mean: window.fit.mean, explained: window.fit.explained, rmse: window.fit.rmse,
        rule: note.rule, components: window.waves.filter(w => note.components.includes(w.id)).map(w => ({
          id: w.id, rank: w.rank, frequency: w.frequency, amplitude: w.amplitude,
          phase: w.phase, improvement: w.improvement, weight: w.weight })),
        musicalStep: note.step, mapping: typeof this.bar?.summary.interpretation === 'string' ? this.bar.summary.interpretation : 'wave-coordinates-with-mood-phrase-memory',
        contextAnalysis: this.barFrame?.id, musicalContext: this.bar?.summary },
    } });
    this.sounding = true;
  }

  audition(_target: string, _time: number) {
    // This experimental mood only plays analyzed material; no fabricated preview.
  }
  drain() { const events = this.events; this.events = []; return events; }
  finish(time: number) {
    this.clock = Math.max(this.clock, time); this.analyzer.reset(); this.frame = null;
    this.release('stopped'); this.greetingDetector.reset(); this.closed = true;
  }
  whenAnalysisIdle() { return this.analyzer.whenIdle(); }
  get planSnapshot() { return this.bar ? { start: this.barStart, bar: this.bar } : null; }
  get analysisSnapshot() { return this.frame; }
  get revisionId() { return this.revision; }
  get inspection(): WaveInspection {
    const read = (frame: WaveFrame, name: 'short' | 'long'): WindowReadout => {
      const window = frame[name];
      const field = musicalField(window);
      return { analysis: frame.id, seconds: window.fit.seconds, target: window.fit.target,
        explained: window.fit.explained, mean: window.fit.mean, rmse: window.fit.rmse,
        waves: window.waves.map(w => {
          const notes = (this.bar?.notes ?? []).filter(n => (n.sourceFrame ?? this.barFrame)?.id === frame.id &&
            n.window === name && n.components.includes(w.id));
          return { id: w.id, rank: w.rank, frequency: w.frequency, amplitude: w.amplitude,
            phase: w.phaseAtEnd, improvement: w.improvement, weight: w.weight, age: w.age,
            cycles: field.components.find(c => c.id === w.id)?.cycles ?? 0,
            roles: [...new Set(notes.map(n => n.slot))], notes: notes.length };
        }) };
    };
    const sources = new Map<string, { frame: WaveFrame; window: 'short' | 'long' }>();
    if (this.barFrame) for (const note of this.bar?.notes ?? []) {
      const frame = note.sourceFrame ?? this.barFrame;
      sources.set(`${frame.id}:${note.window}`, { frame, window: note.window });
    }
    return { decision: this.decision, latestAnalysis: this.frame?.id ?? null, barAnalysis: this.barFrame?.id ?? null,
      ageSeconds: this.frame ? Math.max(0, this.clock - this.frame.arrival) : null, queueSeconds: 0, collectedSeconds: this.analyzer.collectedSeconds,
      latest: this.frame ? this.frame.warmingUp ? [read(this.frame, 'short')] : [read(this.frame, 'short'), read(this.frame, 'long')] : [],
      sources: [...sources.values()].map(s => read(s.frame, s.window)), summary: { ...this.bar?.summary, greetingCount: this.greetingCount, lastGreeting: this.lastGreeting } };
  }
  get diagnostics() {
    return { revision: this.revision, profile: this.config.profile, decision: this.decision,
      collectedSeconds: this.analyzer.collectedSeconds, warmingUp: this.frame?.warmingUp ?? true,
      analysis: this.frame?.id, analysisAge: this.frame ? this.clock - this.frame.arrival : null,
      shortWaves: this.frame?.short.waves.map(w => ({ id: w.id, rank: w.rank, frequency: w.frequency,
        amplitude: w.amplitude, improvement: w.improvement, weight: w.weight })),
      longWaves: (this.frame?.warmingUp ? undefined : this.frame?.long.waves)?.map(w => ({ id: w.id, rank: w.rank, frequency: w.frequency,
        amplitude: w.amplitude, improvement: w.improvement, weight: w.weight })),
      barAnalysis: this.barFrame?.id, ...this.bar?.summary, greetingCount: this.greetingCount, lastGreeting: this.lastGreeting };
  }
}
