import { GAP_SECONDS, type Frame, type Analysis } from './signal.ts';
import { defaultConfiguration, sanitizeConfiguration, soundSlots, type Configuration } from './presets.ts';
import { PlantInterpreter, type MusicalIntent } from './intent.ts';
import { plantExpression } from './modulation.ts';
import { createRules, type MusicalRules } from './rules/index.ts';
import type { Event, Lane, Soundscape } from './music-types.ts';
export type { Event, Lane, Note, Expression, Soundscape } from './music-types.ts';

/** Orchestrates real input, musical clock and a replaceable rules strategy. */
export class Composer {
  private config: Configuration;
  private interpreter = new PlantInterpreter();
  private rules: MusicalRules;
  private intent: MusicalIntent | null = null;
  private events: Event[] = [];
  private stopped = false;
  private clock = -Infinity;
  private serial = 0;
  private collect() {
    for (const event of this.rules.drain()) {
      if (event.type === 'note') {
        event.note.id = this.serial++;
        event.note.slot ??= event.note.lane === 'greeting' ? '$greeting' : soundSlots(this.config).find((s) => s.kind === event.note.lane)?.id;
      }
      if (event.type === 'release' && event.lane && !event.slot)
        event.slot = event.lane === 'greeting' ? '$greeting' : soundSlots(this.config).find((s) => s.kind === event.lane)?.id;
      this.events.push(event);
    }
  }

  constructor(config = defaultConfiguration()) {
    this.config = sanitizeConfiguration(config);
    this.rules = createRules(this.config);
  }
  configure(config: Configuration, time: number) {
    const next = sanitizeConfiguration(config);
    if (next.mood !== this.config.mood) {
      this.rules.finish(time);
      this.collect();
      this.rules = createRules(next);
    } else {
      this.rules.configure(next, time);
      this.collect();
    }
    this.config = next;
    if (this.intent)
      this.events.push({ type: 'expression', time, expression: plantExpression(this.intent, next) });
  }
  push(frame: Frame) {
    if (this.stopped || this.intent && frame.time <= this.intent.frame.time) return;
    if (this.intent && frame.time - this.intent.frame.time > GAP_SECONDS)
      this.expire(frame.time);
    this.intent = this.interpreter.push(frame);
    this.events.push({ type: 'expression', time: frame.time, expression: plantExpression(this.intent, this.config) });
    this.advance(frame.time);
    if (this.intent.greeting) {
      this.rules.greet(frame);
      this.collect();
    }
  }
  advance(time: number) {
    if (this.stopped || !this.intent || time < this.clock) return;
    this.clock = time;
    if (time - this.intent.frame.time > GAP_SECONDS) {
      this.expire(time);
      return;
    }
    // Execute at most the current step: no burst of overdue notes after a stall.
    this.rules.tick(this.intent, time);
    this.collect();
  }
  private expire(time: number) {
    this.rules.finish(time);
    this.collect();
    this.rules = createRules(this.config);
    this.interpreter = new PlantInterpreter();
    this.intent = null;
  }
  finish(time: number) {
    this.stopped = true;
    this.rules.finish(time);
    this.collect();
  }
  audition(target: string, time: number) {
    const slot = soundSlots(this.config).find((s) => s.id === target);
    this.rules.audition(slot?.kind ?? target as Lane, time, slot?.id);
    this.collect();
  }
  drain() {
    const result = this.events;
    this.events = [];
    return result;
  }
  get latest() { return this.intent?.frame ?? null; }
}
export function createSoundscape(
  analysis: Analysis,
  config = defaultConfiguration(),
): Soundscape {
  const c = new Composer(config),
    events: Event[] = [];
  let clock = analysis.frames[0]?.time ?? 0;
  for (const frame of analysis.frames) {
    while (clock + 1 / 30 < frame.time) {
      clock += 1 / 30;
      c.advance(clock);
      events.push(...c.drain());
      // A long disconnected recording needs no empty clock ticks.
      if (!c.latest) { clock = frame.time; break; }
    }
    clock = frame.time;
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
