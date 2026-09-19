import { mood, type MoodSlot, type MoodScore } from '../moods.ts';
import {
  greetingPatch,
  notePool,
  preset,
  soundSlots,
  type Configuration,
  type Patch,
  type SoundSlot,
} from '../presets.ts';
import { clamp, type Frame } from '../signal.ts';
import type { MusicalIntent } from '../intent.ts';
import type { ChannelMix, Event, Lane, Note } from '../music-types.ts';

type Role = NonNullable<MoodSlot['role']>;
const wrap = (value: number, size: number) => ((value % size) + size) % size;
const closest = (pool: number[], target: number) => pool.reduce((best, note) =>
  Math.abs(note - target) < Math.abs(best - target) ? note : best);
const euclidean = (cell: number, pulses: number, length: number, rotation = 0) =>
  wrap((cell + rotation) * pulses, length) < pulses;
const pitchClass = (midi: number) => wrap(midi, 12);
/**
 * One conductor owns harmony, orchestration and effects for every mood.
 * Signal data changes interpretation inside a bounded score; it never gives each
 * slot an unrelated scale or an independent composition.
 */
export class OrchestraRules {
  private events: Event[] = [];
  private next = -Infinity;
  private step = 0;
  private serial = 0;
  private stopped = false;
  private lastSignal = -Infinity;
  private charge = 0;
  private motif = [0, 1, 2, 1, 0, -1, 1, 0];
  private previousPitch = new Map<string, number>();
  private previousVoicing = new Map<string, number[]>();
  private lastGestureMix = new Map<string, number>();
  private lastInstrument = -Infinity;
  private lastGuest = -Infinity;
  private identity = 0.5;
  private rhythmIdentity = 0.5;
  private contourIdentity = 0.5;
  private identityReady = false;
  private profileSamples = 0;
  private paceAverage = 0.5;
  private variationAverage = 0.2;
  private shapeAverage = 0.5;
  private archetype = 0;
  private arrangementVariant = 0;
  private arrangementEpoch = 0;
  private packetRegime = -1;
  private regimeArrival = false;
  private cadenceAverage = 0.2;
  private cadenceBand = 2;
  private phraseVariant = 0;
  private phraseEnergy = 0.5;
  private config: Configuration;
  private score: MoodScore;

  constructor(config: Configuration) {
    this.config = config;
    this.score = mood(config.mood).score;
  }

  configure(config: Configuration, time: number) {
    const before = soundSlots(this.config);
    const after = soundSlots(config);
    if (JSON.stringify(before.map((slot) => slot.patch.notes)) !==
      JSON.stringify(after.map((slot) => slot.patch.notes)) ||
      before.some((slot, index) => slot.patch.tuning !== after[index]?.patch.tuning)) {
      this.events.push({ type: 'release', time });
      this.previousPitch.clear();
      this.previousVoicing.clear();
      this.next = -Infinity;
    }
    this.config = config;
  }

  private observe(intent: MusicalIntent) {
    if (intent.frame.seq === this.lastSignal) return;
    this.lastSignal = intent.frame.seq;
    const impulse = intent.history.microChange * 0.3 + intent.history.turn * 0.24 +
      intent.history.burst * 0.18 + intent.fingerprint.novelty * 0.18 +
      Math.abs(intent.history.deviation) * 0.1;
    this.charge = clamp(this.charge * 0.86 + impulse * 0.28 * (this.config.plantResponse ?? 1));
    const cell = wrap(intent.frame.seq * 3, this.motif.length);
    const measured = Math.round(Math.tanh(
      intent.frame.profile[wrap(cell + intent.frame.seq, 10)] / intent.profileScale) * 3 +
      intent.contour);
    this.motif[cell] += Math.sign(measured - this.motif[cell]);
    const follow = this.profileSamples ? 0.16 : 1;
    this.paceAverage += (intent.character.pace - this.paceAverage) * follow;
    this.variationAverage += (intent.character.variation - this.variationAverage) * follow;
    this.shapeAverage += (intent.shape - this.shapeAverage) * follow;
    if ((intent.packet?.confidence ?? 0) >= 0.3)
      this.cadenceAverage += (intent.packet.cadence - this.cadenceAverage) *
        (this.profileSamples ? 0.24 : 1);
    this.profileSamples++;
    const packetRegime = intent.packet?.regime ?? 0;
    if (this.packetRegime < 0) this.packetRegime = packetRegime;
    const regimeChanged = packetRegime !== this.packetRegime &&
      (intent.packet?.confidence ?? 0) >= 0.3;
    if (regimeChanged) {
      this.packetRegime = packetRegime;
      // A connection is still being characterised before the first score starts.
      // Absorb any detector epoch here without playing a false transformation.
      if (!this.identityReady) return;
      this.paceAverage = intent.packet.pace;
      this.cadenceAverage = intent.packet.cadence;
      this.variationAverage = intent.character.variation;
      this.shapeAverage = intent.shape;
      this.lockProfile();
      this.arrangementEpoch++;
      this.regimeArrival = true;
      this.step = 0;
      this.charge = 1;
      this.lastInstrument = -Infinity;
      this.lastGuest = -Infinity;
      return;
    }
    // The first seconds are dominated by cadence warm-up and made very different
    // plants look alike. Listen for roughly one phrase, then lock the arrangement
    // identity; live gestures keep reacting without the musical personality jumping.
    if (!this.identityReady && this.profileSamples >= 12) {
      this.lockProfile();
    }
  }

  private lockProfile() {
    const slow = this.paceAverage < 0.65 ? 1 : 0;
    const still = this.variationAverage < 0.1 ? 2 : 0;
    this.archetype = slow + still;
    this.cadenceBand = this.cadenceAverage < 0.04 ? 0 :
      this.cadenceAverage < 0.14 ? 1 : this.cadenceAverage < 0.35 ? 2 : 3;
    this.arrangementVariant = this.cadenceBand;
    this.identity = [0.14, 0.4, 0.67, 0.88][this.archetype];
    this.rhythmIdentity = [0.16, 0.42, 0.68, 0.9][this.arrangementVariant];
    this.contourIdentity = [0.72, 0.84, 0.24, 0.4][this.arrangementVariant] +
      clamp((this.shapeAverage - 0.5) * 0.24, -0.08, 0.08);
    this.identityReady = true;
    this.previousPitch.clear();
    this.previousVoicing.clear();
  }

  private definition(slot: SoundSlot) {
    return mood(this.config.mood).slots.find((candidate) => candidate.id === slot.id)!;
  }

  private activity(intent: MusicalIntent) {
    return clamp(intent.character.variation * 0.28 + intent.character.pace * 0.12 +
      intent.fingerprint.entropy * 0.18 + intent.history.volatility * 0.16 +
      intent.history.microChange * 0.16 + this.charge * 0.1);
  }

  private beat(intent: MusicalIntent) {
    const base = this.score.style === 'organic' ? 0.72 : this.score.style === 'serene' ? 0.86 :
      this.score.style === 'drift' ? 0.78 : this.score.style === 'psychedelic' ? 0.64 : 0.56;
    const breathing = this.score.style === 'ritual' ? 0.08 :
      intent.fingerprint.cadence * 0.2 + (1 - intent.character.variation) * 0.1;
    const profileTempo = this.identityReady ? [0.7, 0.86, 1.05, 1.35][this.cadenceBand] : 1;
    return (base + breathing) * profileTempo / this.config.speed;
  }

  private rootDegree() {
    const span = this.score.style === 'psychedelic' ? 4 : this.score.style === 'organic' ? 6 : 8;
    const base = [...this.score.progression];
    const variants = [
      base,
      [base[0], ...base.slice(1).reverse()],
      [...base.slice(1), base[0]],
      base.map((_, index) => index % 2 === 0 ? base[0] :
        base[wrap(2 + Math.floor(index / 2), base.length)]),
    ];
    const progression = variants[this.arrangementVariant];
    return progression[(Math.floor(this.step / span) + this.arrangementEpoch) % progression.length];
  }

  private profileName() {
    return ['flowing', 'responsive', 'rooted', 'contemplative'][this.archetype];
  }

  private sceneName() {
    return ['cascade', 'ripples', 'lyrical', 'stillness'][this.cadenceBand];
  }

  private evolvePhrase(intent: MusicalIntent, cell: number) {
    if (cell !== 0) return;
    const signal = Math.tanh(intent.frame.profile[
      wrap(Math.floor(this.step / 16) * 3 + this.arrangementEpoch, 10)] / intent.profileScale);
    const stride = 1 + wrap(Math.round((signal + 1) * 2 + intent.history.turn * 3), 3);
    this.phraseVariant = wrap(this.phraseVariant + stride, 4);
    this.phraseEnergy = clamp(this.activity(intent) * 0.58 +
      intent.fingerprint.novelty * 0.24 + intent.history.recurrence * 0.18);
  }

  private chordClasses(rootDegree: number, color = false) {
    const harmony = this.config.harmony ?? this.score.harmony;
    const root = harmony.notes[wrap(rootDegree, harmony.notes.length)];
    // Recognisable consonant vocabularies first; only use a chord when every note
    // belongs to the user's shared scale. Fall back to a diatonic stack otherwise.
    const shapes = color
      ? [[0, 4, 7, 11], [0, 3, 7, 10], [0, 4, 7, 9], [0, 2, 7], [0, 5, 7], [0, 4, 7]]
      : [[0, 4, 7], [0, 3, 7], [0, 2, 7], [0, 5, 7]];
    const phase = Math.floor(this.step / 16) + this.arrangementVariant + this.arrangementEpoch;
    for (let offset = 0; offset < shapes.length; offset++) {
      const classes = shapes[wrap(phase + offset, shapes.length)]
        .map((interval) => wrap(root + interval, 12));
      if (classes.every((candidate) => harmony.notes.includes(candidate))) return classes;
    }
    const degrees = color ? [0, 2, 4, 6] : [0, 2, 4];
    return degrees.map((degree) => harmony.notes[wrap(rootDegree + degree, harmony.notes.length)]);
  }

  private voicing(slot: SoundSlot, rootDegree: number, count: number, color = false) {
    const pool = notePool(slot.patch);
    const classes = this.chordClasses(rootDegree, color);
    const definition = this.definition(slot);
    const low = definition.role === 'lead' || definition.role === 'counterline'
      ? Math.floor((pool.length - 1) * 0.12) : 0;
    const highRatio = this.score.style === 'serene' && definition.role === 'lead' ? 0.64 :
      definition.role === 'lead' || definition.role === 'counterline' ? 0.8 : 1;
    const high = Math.max(low, Math.floor((pool.length - 1) * highRatio));
    const candidates = pool.slice(low, high + 1)
      .filter((note) => classes.includes(pitchClass(note)));
    if (!candidates.length) return [];
    const previous = this.previousVoicing.get(slot.id) ?? [];
    const result: number[] = [];
    for (let voice = 0; voice < count; voice++) {
      const registerShift = [0.08, 0.18, -0.05, -0.13][this.arrangementVariant] +
        [-0.11, 0.02, 0.13, -0.04][this.phraseVariant];
      const home = pool[Math.round((pool.length - 1) *
        clamp(0.28 + voice * 0.25 + registerShift, 0, 1))];
      const target = previous[voice] === undefined ? home : previous[voice] * 0.64 + home * 0.36;
      const available = candidates.filter((note) => !result.includes(note) &&
        result.every((other) => Math.abs(note - other) >= 3));
      if (!available.length) break;
      result.push(closest(available, target));
    }
    result.sort((a, b) => a - b);
    this.previousVoicing.set(slot.id, result);
    return result;
  }

  private effectMix(slot: SoundSlot, intent: MusicalIntent, phase: number): ChannelMix {
    const role = this.definition(slot).role ?? 'pad';
    const activity = this.activity(intent);
    const sample = 0.5 + 0.5 * Math.tanh(
      intent.frame.profile[wrap(this.step + slot.id.length, 10)] / intent.profileScale);
    const rise = [0.92, 0.97, 1, 0.95][phase];
    let level = slot.level * rise;
    let delayOn = false, delayWet = 0, delayRate = 82;
    let reverbWet = 20, reverbAmount = 70;
    let chorusOn = slot.kind === 'synth', chorusDepth = 4, chorusRate = 18, smoothing = 1.8;

    if (this.score.style === 'organic') {
      reverbWet = role === 'lead' ? 8 + sample * 2 : 11 + sample * 2;
      reverbAmount = 67 + (1 - activity) * 7;
      chorusOn = slot.kind === 'synth';
      chorusDepth = 3 + sample * 4;
      smoothing = role === 'lead' ? 1.1 : 2.4;
    } else if (this.score.style === 'serene') {
      const balances: Record<Role, number[]> = {
        foundation: [0.92, 0.84, 1, 0.9], pad: [0.9, 0.8, 0.82, 1],
        lead: [1, 0.98, 0.86, 0.8], counterline: [0.9, 1, 0.72, 0.58],
        pulse: [1, 1, 1, 1], accent: [1, 1, 1, 1],
      };
      level *= balances[role][this.archetype];
      reverbWet = role === 'foundation' ? 8 : role === 'pad' ? 12 : role === 'lead' ? 9 : 10;
      reverbAmount = role === 'pad' ? 73 : 66 + sample * 5;
      chorusOn = slot.kind === 'synth';
      chorusDepth = role === 'pad' ? 7 + sample * 3 : 3 + sample * 2;
      smoothing = role === 'lead' ? 1.25 : 2.8;
    } else if (this.score.style === 'drift') {
      level *= role === 'accent' ? 0.72 + activity * 0.28 : 1;
      delayOn = false;
      delayWet = 0;
      delayRate = 84;
      reverbWet = 9 + (1 - activity) * 3;
      reverbAmount = 71 + sample * 6;
      chorusOn = slot.kind === 'synth';
      chorusDepth = 7 + sample * 6;
      smoothing = 3;
    } else if (this.score.style === 'psychedelic') {
      delayOn = false;
      delayWet = 0;
      delayRate = 78;
      reverbWet = 8 + (1 - sample) * 3;
      reverbAmount = 70 + activity * 8;
      chorusOn = slot.kind === 'synth';
      chorusDepth = 10 + sample * 9;
      chorusRate = 18 + (1 - sample) * 18;
      smoothing = 1.8;
    } else {
      const percussion = preset(slot.patch.preset).family === 'percussion';
      delayOn = false;
      reverbWet = percussion ? 5 + activity * 2 : 9 + sample * 3;
      reverbAmount = percussion ? 50 : 67 + activity * 7;
      chorusOn = slot.kind === 'synth';
      chorusDepth = chorusOn ? 4 + sample * 4 : 0;
      smoothing = percussion ? 1.2 : 2.2;
    }
    return {
      level: clamp(level, 0, 1),
      delay: { on: delayOn, wet: clamp(delayWet, 0, 18), rate: clamp(delayRate, 50, 90) },
      reverb: { on: true, wet: clamp(reverbWet, 0, 32), amount: clamp(reverbAmount, 20, 86) },
      chorus: { on: chorusOn, depth: clamp(chorusDepth, 0, 22), rate: clamp(chorusRate, 8, 50) },
      smoothing,
    };
  }

  private automate(intent: MusicalIntent, time: number) {
    if (this.step % 4) return;
    const phase = Math.floor(this.step / 16) % 4;
    for (const slot of soundSlots(this.config))
      this.events.push({ type: 'mix', time, slot: slot.id, mix: this.effectMix(slot, intent, phase) });
  }

  /** Each gesture gets its own space and echo, on top of the slower phrase mix. */
  private gestureMix(slot: SoundSlot, intent: MusicalIntent, reason: string,
    articulation: number): ChannelMix {
    const phase = Math.floor(this.step / 16) % 4;
    const mix = this.effectMix(slot, intent, phase);
    const signal = Math.tanh(intent.frame.profile[
      wrap(this.step * 5 + this.serial + slot.id.length, 10)] / intent.profileScale);
    const response = /answer|response|resolution|apparition|glint|ember/.test(reason) ? 1 :
      /question|call|pulse/.test(reason) ? -0.45 : signal;
    const percussion = preset(slot.patch.preset).family === 'percussion';
    return {
      ...mix,
      delay: {
        ...mix.delay,
        wet: mix.delay.on ? clamp(mix.delay.wet + response + signal * 0.6, 0, 8) : 0,
      },
      reverb: {
        on: true,
        wet: clamp(mix.reverb.wet + response * (percussion ? 0.5 : 1.5) + articulation, 0, 32),
        amount: clamp(mix.reverb.amount + signal * 2 + response * 2, 42, 86),
      },
      chorus: {
        ...mix.chorus,
        depth: mix.chorus.on ? clamp(mix.chorus.depth + signal * 2, 0, 22) : 0,
      },
      smoothing: slot.kind === 'instrument' ? 1.8 + articulation * 0.8 : mix.smoothing,
    };
  }

  private emit(slot: SoundSlot, intent: MusicalIntent, time: number, midi: number,
    duration: number, velocity: number, pan: number, reason: string,
    articulation = 0.5, pitchCurve?: Note['pitchCurve'], greeting = false,
    sampleOffset = 0) {
    const articulationSignal = intent.frame.seq < 0 ? 0 : Math.tanh(intent.frame.profile[
      wrap(this.step + this.serial * 3 + slot.id.length, 10)] / (intent.profileScale || 1));
    const shapedArticulation = clamp(articulation + articulationSignal * 0.16, 0.05, 0.98);
    const patch: Patch = greeting ? greetingPatch(slot.patch) : {
      ...slot.patch,
      envelope: {
        on: true,
        attack: slot.kind === 'synth' ? clamp(22 + shapedArticulation * 50, 0, 100) :
          clamp(shapedArticulation * 18, 0, 100),
        release: slot.kind === 'synth' ? clamp(52 + shapedArticulation * 35, 0, 100) :
          clamp(18 + shapedArticulation * 48, 0, 100),
      },
    };
    const previousMix = this.lastGestureMix.get(slot.id) ?? -Infinity;
    if (!greeting && intent.frame.seq >= 0 && time - previousMix > 0.32) {
      this.events.push({ type: 'mix', time, slot: slot.id,
        mix: this.gestureMix(slot, intent, reason, shapedArticulation) });
      this.lastGestureMix.set(slot.id, time);
    }
    this.events.push({ type: 'note', time, note: {
      id: this.serial++, time, sourceTime: intent.frame.time, source: intent.frame.seq,
      midi, duration, velocity: clamp(velocity, 5, 127), pan: clamp(pan, -1, 1),
      color: clamp(0.2 + intent.detail * 0.45 + intent.history?.microChange * 0.35),
      lane: greeting ? 'greeting' : slot.kind,
      slot: greeting ? '$greeting' : slot.id,
      patch,
      fade: slot.kind === 'synth' ? Math.min(duration * 0.32, 2.6) : undefined,
      sampleOffset,
      pitchCurve,
      plantProfile: this.identityReady ? this.profileName() : 'listening',
      plantEpoch: this.arrangementEpoch,
      plantTempoScene: this.sceneName(),
      packetCadenceMs: intent.packet ? Math.round(intent.packet.cadence * 1000) : undefined,
      packetTempoChange: intent.packet?.change,
      reason: greeting ? 'orchestra-greeting' : `${this.score.style}-${reason}`,
      phraseStep: this.step % 16,
    } });
  }

  private melodicNote(slot: SoundSlot, intent: MusicalIntent, rootDegree: number,
    offset: number, chordTone: boolean) {
    const pool = notePool(slot.patch);
    const previous = this.previousPitch.get(slot.id);
    const definition = this.definition(slot);
    const low = Math.floor((pool.length - 1) * 0.18);
    const highRatio = this.score.style === 'serene' && definition.role === 'lead' ? 0.64 : 0.78;
    const high = Math.max(low, Math.floor((pool.length - 1) * highRatio));
    const center = Math.round((low + high) * 0.5);
    const previousIndex = previous === undefined ? center : Math.max(0, pool.indexOf(previous));
    const motif = this.motif[wrap(this.step + offset +
      Math.floor(this.contourIdentity * this.motif.length), this.motif.length)];
    const local = Math.round(Math.tanh(intent.frame.profile[
      wrap(this.step * 3 + offset, 10)] / intent.profileScale) * 2);
    const gravity = previousIndex > center + 2 ? -1 : previousIndex < center - 2 ? 1 : 0;
    let candidates = pool.slice(low, high + 1);
    if (chordTone) {
      const classes = this.chordClasses(rootDegree);
      candidates = candidates.filter((note) => classes.includes(pitchClass(note)));
    }
    if (!candidates.length) candidates = pool.slice(low, high + 1);
    const personaStep = Math.round((this.contourIdentity - 0.5) * 5);
    const target = pool[Math.round(clamp(previousIndex + motif + local + gravity + personaStep, low, high))];
    const nearby = candidates.filter((note) => previous === undefined || Math.abs(note - previous) <= 7);
    let midi = closest(nearby.length ? nearby : candidates, target);
    if (midi === previous && candidates.length > 1)
      midi = closest(candidates.filter((note) => note !== midi),
        midi + (previousIndex >= center || intent.contour < 0 ? -2 : 2));
    this.previousPitch.set(slot.id, midi);
    return midi;
  }

  private guest(slot: SoundSlot | undefined, intent: MusicalIntent, time: number,
    beat: number, cell: number, root: number) {
    if (!slot || this.step < 32 && !this.regimeArrival) return;
    const target = wrap(5 + Math.floor(this.identity * 9), 16);
    const overdue = time - this.lastGuest > beat * [40, 56, 80, 120][this.cadenceBand];
    const invited = this.charge + intent.history.turn * 0.3 +
      intent.fingerprint.novelty * 0.24 > 0.92;
    if (!this.regimeArrival && (cell !== target || !overdue && !invited)) return;
    const midi = this.melodicNote(slot, intent, root, this.identity > 0.5 ? 3 : -2, true);
    this.emit(slot, intent, time + beat * 0.12, midi, beat * (3.6 + intent.history.recurrence),
      38 + this.charge * 16, 0.22,
      this.regimeArrival ? 'packet-regime-voice' : 'plant-invited-voice', 0.9);
    this.lastGuest = time;
    this.charge *= 0.45;
  }

  private organic(intent: MusicalIntent, time: number, beat: number, cell: number, root: number) {
    const slots = Object.fromEntries(soundSlots(this.config).map((slot) => [slot.id, slot]));
    const activity = this.activity(intent);
    const plans = [
      { groundEvery: 8, groundVoices: 1, voices: 3, spread: 0.22, duration: 2.2 },
      { groundEvery: 8, groundVoices: 2, voices: 3, spread: 0.38, duration: 3.8 },
      { groundEvery: 8, groundVoices: 1, voices: 1, spread: 0, duration: 3.2 },
      { groundEvery: 16, groundVoices: 2, voices: 2, spread: 0.03, duration: 8.2 },
    ];
    const scenePatterns = [
      [[0, 3, 6, 9, 12, 15], [0, 2, 5, 8, 11, 14], [0, 4, 7, 10, 13], [0, 3, 7, 11, 15]],
      [[0, 4, 8, 12], [0, 5, 9, 13], [0, 3, 7, 12], [0, 6, 10, 14]],
      [[1, 6, 11, 15], [0, 5, 10, 14], [2, 7, 12], [0, 4, 9, 15]],
      [[0, 8], [0, 10], [0, 7, 14], [0, 9]],
    ];
    const plan = plans[this.cadenceBand];
    const cells = scenePatterns[this.cadenceBand][this.phraseVariant];
    if (cell % plan.groundEvery === 0) {
      const voices = Math.max(1, plan.groundVoices -
        (this.cadenceBand === 1 && this.phraseVariant % 3 === 0 ? 1 : 0)) +
        (this.cadenceBand === 2 && activity + this.charge > 0.82 ? 1 : 0);
      this.voicing(slots.ground, root, voices, voices > 1).forEach((midi, voice) =>
        this.emit(slots.ground, intent, time + voice * beat * 0.42, midi,
          beat * ([8.5, 10, 11, 15][this.cadenceBand] - voice), 43 - voice * 8, voice ? 0.18 : -0.12,
          voice ? 'opening-harmonic' : 'living-foundation', 0.9));
    }
    if (cells.includes(cell) || this.regimeArrival) {
      const entry = Math.max(0, cells.indexOf(cell));
      const gesture = wrap(entry + this.phraseVariant, 4);
      const closing = cell === cells.at(-1);
      let voices = plan.voices;
      if (this.cadenceBand === 0) voices = [3, 2, 1, 3][gesture];
      else if (this.cadenceBand === 1) voices = [3, 1, 2, 4][gesture];
      else if (this.cadenceBand === 2) voices = closing ? 2 : 1;
      else voices = [2, 3, 2, 2][gesture];
      if (this.regimeArrival) voices = 3;
      const chord = voices > 1;
      const gestureRoot = root + [0, 1, -1, 0][gesture];
      const notes = chord ? this.voicing(slots.melody, gestureRoot, voices, true) :
        [this.melodicNote(slots.melody, intent, gestureRoot,
          [-2, 1, 3, -1][gesture], cell === 0 || closing)];
      const descending = intent.history.trend < -0.08 ||
        wrap(this.phraseVariant + entry, 3) === 2;
      const ordered = descending && chord ? [...notes].reverse() : notes;
      const spread = chord ? plan.spread * (0.72 + this.phraseEnergy * 0.5 + gesture * 0.06) : 0;
      const duration = plan.duration * (0.82 + this.phraseEnergy * 0.3) +
        (closing ? 1.4 : gesture === 1 ? 0.55 : 0);
      ordered.forEach((midi, voice) => this.emit(slots.melody, intent,
        time + voice * beat * (this.regimeArrival ? 0.04 : spread), midi,
        beat * (this.regimeArrival ? 5.4 : duration),
        52 + intent.motion * 13 + this.phraseEnergy * 8 - voice * 4,
        -0.24 + voice * (0.48 / Math.max(1, voices - 1)),
        this.regimeArrival ? 'packet-regime-change' :
          this.cadenceBand <= 1 ? chord ? voices === 2 ? 'canopy-dyad' : 'canopy-arpeggio' :
            'canopy-solo' : this.cadenceBand === 2 ?
            closing ? 'lyrical-resolution' : 'lyrical-line' : 'still-chord',
        this.cadenceBand >= 2 ? 0.9 : 0.58));
      if (closing) this.charge *= 0.52;
    }
    this.guest(slots.visitor, intent, time, beat, cell, root);
  }

  private serene(intent: MusicalIntent, time: number, beat: number, cell: number, root: number) {
    const slots = Object.fromEntries(soundSlots(this.config).map((slot) => [slot.id, slot]));
    const activity = this.activity(intent);
    if (cell % 8 === 0) {
      this.voicing(slots.ground, root, 1).forEach((midi) =>
        this.emit(slots.ground, intent, time, midi, beat * 9.5, 49, -0.08, 'grounded-root', 0.9));
      this.voicing(slots.air, root, 2, true).forEach((midi, voice) =>
        this.emit(slots.air, intent, time + voice * beat * 0.32, midi, beat * (7.8 - voice * 0.3),
          35 - voice * 6, voice ? 0.28 : -0.24, 'voice-led-bed', 0.82));
    }
    const phrase = Math.floor(this.step / 16);
    const phraseShift = Math.round(Math.tanh(
      intent.frame.profile[wrap(phrase + 3, 10)] / intent.profileScale));
    const patterns = [[0, 3, 6, 9, 12, 15], [0, 4, 8, 12], [1, 7, 13], [0, 8]];
    const pattern = patterns[this.arrangementVariant];
    const opening = pattern[0], closingCell = pattern.at(-1)!;
    const middleCells = pattern.slice(1, -1).map((entry) => wrap(entry + phraseShift, 16));
    const middle = middleCells.includes(cell);
    const chordCell = this.regimeArrival || cell === opening || middle || cell === closingCell;
    const middleThreshold = [0.2, 0.32, 0.58, 1][this.cadenceBand];
    if (chordCell && (!middle || activity + this.charge > middleThreshold)) {
      const closing = cell === closingCell;
      const voices = this.regimeArrival || this.cadenceBand <= 1 ? 3 : 2;
      const reason = this.regimeArrival ? 'packet-regime-change' :
        closing ? 'resolution-chord' : cell === opening ? 'question-chord' : 'passing-dyad';
      const notes = this.voicing(slots.lead, root, voices, true);
      const descending = intent.history.trend < -0.1 || (phrase + Math.floor(this.identity * 5)) % 3 === 2;
      const ordered = descending ? [...notes].reverse() : notes;
      const broken = this.cadenceBand <= 1 && !closing;
      const spread = broken ? beat * ([0.22, 0.42][this.cadenceBand] +
        intent.fingerprint.irregularity * 0.24) : beat * 0.025;
      const sustain = [0.72, 0.95, 1.25, 1.65][this.cadenceBand];
      ordered.forEach((midi, voice) => this.emit(slots.lead, intent,
        time + voice * spread, midi,
        beat * (closing ? 6.2 : broken ? 4.8 + voice * 0.25 : 4.6) * sustain,
        53 + activity * 12 + (this.cadenceBand <= 1 ? 4 : 0) - voice * 3,
        -0.2 + voice * (0.4 / Math.max(1, voices - 1)),
        broken ? `${reason}-slow` : reason, closing ? 0.98 : 0.88));
      if (closing) this.charge *= 0.55;
    }
    const responseCell = 10 + wrap(Math.round((intent.fingerprint.asymmetry + 1) * 2) + phrase, 5);
    const responseWait = [24, 36, 64, 96][this.cadenceBand];
    const overdue = time - this.lastInstrument > beat * responseWait;
    if (cell === responseCell && (overdue || this.charge + activity > 0.82)) {
      const midi = this.melodicNote(slots.answer, intent, root, 3, true);
      this.emit(slots.answer, intent, time + beat * (0.08 + intent.fingerprint.cadence * 0.18),
        midi, beat * (2.4 + intent.history.recurrence),
        39 + this.charge * 15, 0.26, 'secondary-response', 0.9);
      this.lastInstrument = time;
      this.charge *= 0.44;
    }
    if (this.regimeArrival) {
      const midi = this.melodicNote(slots.answer, intent, root, -2, true);
      this.emit(slots.answer, intent, time + beat * 0.85, midi, beat * 3.8,
        48, 0.3, 'packet-regime-response', 0.94);
      this.lastInstrument = time;
    }
  }

  private drift(intent: MusicalIntent, time: number, beat: number, cell: number, root: number) {
    const slots = Object.fromEntries(soundSlots(this.config).map((slot) => [slot.id, slot]));
    if (cell % 8 === 0) this.voicing(slots.horizon, root, 2, true).forEach((midi, voice) =>
      this.emit(slots.horizon, intent, time + voice * beat * 0.5, midi, beat * 11,
        38 - voice * 7, voice ? 0.14 : -0.12, 'slow-horizon', 0.95));
    const cloudCells = [[0, 4, 8, 12], [0, 3, 7, 11, 14], [0, 6, 10], [0, 8]][this.arrangementVariant];
    if (cloudCells.includes(cell)) this.voicing(slots.cloud, root,
      this.arrangementVariant === 1 || this.activity(intent) > 0.6 ? 3 : 2, true)
      .forEach((midi, voice) => this.emit(slots.cloud, intent, time + voice * beat * 0.38,
        midi, beat * (5.8 - voice * 0.25), 30 - voice * 4,
        (voice - 1) * 0.3, 'suspended-cloud', 0.88));
    const glintCells = [[5, 13], [2, 7, 12], [4, 11], [7, 15]][this.arrangementVariant];
    if (glintCells.includes(cell) && this.activity(intent) + this.charge > 0.62) {
      const midi = this.melodicNote(slots.glint, intent, root, 5, true);
      this.emit(slots.glint, intent, time, midi, beat * 2.4, 34 + this.charge * 22,
        cell === 5 ? -0.42 : 0.42, 'synth-glint', 0.42, [-0.3, 0.45, 0]);
    }
    const overdue = time - this.lastInstrument > beat * 44;
    if (cell === 15 && (overdue || this.charge > 0.58)) {
      const pool = notePool(slots.marker.patch);
      const classes = this.chordClasses(root);
      const candidates = pool.filter((note) => classes.includes(pitchClass(note)));
      const midi = closest(candidates.length ? candidates : pool, pool[Math.floor(pool.length * 0.55)]);
      this.emit(slots.marker, intent, time, midi, beat * 3.4, 47 + this.charge * 24,
        intent.history.deviation * 0.3, 'rare-marker', 0.85);
      this.lastInstrument = time;
      this.charge *= 0.16;
    }
    if (this.regimeArrival) {
      const midi = this.melodicNote(slots.marker, intent, root, -3, true);
      this.emit(slots.marker, intent, time + beat * 0.7, midi, beat * 3.2,
        52, 0.2, 'packet-regime-marker', 0.9);
      this.lastInstrument = time;
    }
  }

  private psychedelic(intent: MusicalIntent, time: number, beat: number, cell: number, root: number) {
    const slots = Object.fromEntries(soundSlots(this.config).map((slot) => [slot.id, slot]));
    const direction = (intent.contour || intent.history.trend) < 0 ? -1 : 1;
    if (cell % 8 === 0) this.voicing(slots.tide, root, 2, true).forEach((midi, voice) =>
      this.emit(slots.tide, intent, time + voice * beat * 0.05, midi, beat * 12,
        45 + intent.motion * 14 - voice * 7, voice ? 0.12 : -0.12,
        'stable-modal-pedal', 0.97));
    const spiralCells = [[0, 5, 10, 15], [0, 3, 7, 12], [0, 6, 11], [0, 8]][this.arrangementVariant];
    if (spiralCells.includes(cell)) this.voicing(slots.spiral, root,
      this.arrangementVariant === 1 ? 3 : 2, true)
      .forEach((midi, voice) => this.emit(slots.spiral, intent,
        time + voice * beat * (0.34 + this.identity * 0.18), midi, beat * 6.4,
        38 - voice * 4, direction * (voice ? 0.36 : -0.32),
        'polymetric-harmony', 0.88));
    const auraCells = [[3, 8, 13], [2, 6, 10, 14], [4, 11], [6, 14]][this.arrangementVariant];
    if (auraCells.includes(cell) &&
      (cell === 8 || this.activity(intent) + this.charge > 0.52)) {
      const midi = this.melodicNote(slots.aura, intent, root, 2, cell % 4 === 1);
      this.emit(slots.aura, intent, time, midi, beat * (3.8 + this.charge),
        34 + this.activity(intent) * 18, cell % 2 ? 0.42 : -0.42,
        'prismatic-line', 0.9);
    }
    if ((cell === 7 || cell === 15) && time - this.lastInstrument > beat * 32 &&
      (this.charge > 0.42 || intent.history.turn > 0.48)) {
      const midi = this.melodicNote(slots.apparition, intent, root, 6, true);
      this.emit(slots.apparition, intent, time + beat * 0.18, midi, beat * 1.8,
        48 + this.charge * 35, -intent.history.deviation * 0.42, 'sitar-apparition', 0.28);
      this.lastInstrument = time;
      this.charge *= 0.24;
    }
    if (this.regimeArrival) {
      const midi = this.melodicNote(slots.apparition, intent, root, -2, true);
      this.emit(slots.apparition, intent, time + beat * 0.8, midi, beat * 2.8,
        54, -0.28, 'packet-regime-apparition', 0.82);
      this.lastInstrument = time;
    }
  }

  private ritual(intent: MusicalIntent, time: number, beat: number, cell: number, root: number) {
    const slots = Object.fromEntries(soundSlots(this.config).map((slot) => [slot.id, slot]));
    const activity = this.activity(intent);
    if (cell % 8 === 0) this.voicing(slots.earth, root, 2).forEach((midi, voice) =>
      this.emit(slots.earth, intent, time + voice * beat * 0.2, midi, beat * 10,
        43 - voice * 9, 0, 'earth-pedal', 0.9));
    const percussion = notePool(slots.pulse.patch);
    const hit = euclidean(cell, 2 + this.arrangementVariant + Math.round(activity * 2), 16,
      Math.round(intent.fingerprint.asymmetry * 3) + this.arrangementVariant * 2);
    const ghost = !hit && activity > 0.76 && euclidean(cell, 1, 9, this.step % 9);
    if ((hit || ghost) && cell < 15) {
      const index = wrap(cell + Math.round(intent.shape * 5), percussion.length);
      this.emit(slots.pulse, intent, time, percussion[index], beat * (ghost ? 0.3 : 0.65),
        (cell % 4 === 0 ? 62 : 52) * (ghost ? 0.42 : 1), -0.08,
        ghost ? 'ghost-pulse' : 'ground-pulse', 0.08);
    }
    const breathCells = [[2, 10, 14], [1, 6, 11, 14], [3, 10], [4, 12]][this.arrangementVariant];
    if (breathCells.includes(cell)) {
      const midi = this.melodicNote(slots.breath, intent, root, cell < 8 ? 0 : 3, cell % 8 === 2);
      this.emit(slots.breath, intent, time + beat * 0.08, midi, beat * (cell === 14 ? 3.6 : 2.5),
        49 + intent.motion * 17, 0.2, cell < 8 ? 'wind-call' : 'wind-response', 0.84);
    }
    const emberCells = [[3, 7, 11], [2, 5, 9, 13], [5, 13], [7]][this.arrangementVariant];
    if (emberCells.includes(cell) && activity + this.charge > 0.52) {
      const midi = this.melodicNote(slots.embers, intent, root, 4, true);
      this.emit(slots.embers, intent, time + beat * 0.18, midi, beat * 0.72,
        48 + activity * 27, -0.28, 'kalimba-ember', 0.18);
    }
    if (this.regimeArrival) {
      const midi = this.melodicNote(slots.breath, intent, root, -2, true);
      this.emit(slots.breath, intent, time + beat * 0.65, midi, beat * 3.4,
        55, 0.24, 'packet-regime-breath', 0.9);
    }
  }

  tick(intent: MusicalIntent, time: number) {
    if (this.stopped) return;
    this.observe(intent);
    if (time < this.next) return;
    const beat = this.beat(intent), cell = this.step % 16;
    if (!this.identityReady && this.step === 0) this.phraseVariant = 1;
    else this.evolvePhrase(intent, cell);
    const root = this.rootDegree();
    // A plant-switch greeting used to mask the transformation chord. Let it finish,
    // then reveal the new scene as one deliberate musical event.
    const scoreTime = this.regimeArrival && intent.greeting ? time + 1.05 : time;
    this.automate(intent, scoreTime);
    if (this.score.style === 'organic') this.organic(intent, scoreTime, beat, cell, root);
    else if (this.score.style === 'serene') this.serene(intent, scoreTime, beat, cell, root);
    else if (this.score.style === 'drift') this.drift(intent, scoreTime, beat, cell, root);
    else if (this.score.style === 'psychedelic') this.psychedelic(intent, scoreTime, beat, cell, root);
    else this.ritual(intent, scoreTime, beat, cell, root);
    this.regimeArrival = false;
    const swing = this.score.style === 'ritual' ? intent.fingerprint.irregularity * 0.12 : 0;
    this.next = scoreTime + beat * (1 + (cell % 2 ? -swing : swing));
    this.step++;
  }

  greet(frame: Frame) {
    const slots = soundSlots(this.config);
    const slot = slots.find((candidate) => candidate.kind === 'instrument' &&
      !preset(candidate.patch.preset).percussion) ?? slots[0];
    const pool = notePool(slot.patch);
    const fake = { frame, detail: 0.35, history: { microChange: 0 } } as MusicalIntent;
    [0, 0.16, 0.38].forEach((delay, index) => this.emit(slot, fake, frame.time + delay,
      pool[Math.min(pool.length - 1, Math.floor(pool.length * 0.48) + index * 2)],
      0.8, 64 - index * 7, (index - 1) * 0.18, 'greeting', 0.4, undefined, true));
  }

  audition(lane: Lane, time: number, slotId?: string) {
    const frame: Frame = { time, seq: -1, center: 14, level: 0, spread: 0.02,
      roughness: 0.01, slope: 0, spectrum: Array(9).fill(0.01),
      profile: Array(10).fill(0), cadence: 0 };
    if (lane === 'greeting') { this.greet(frame); return; }
    const slot = soundSlots(this.config).find((candidate) =>
      slotId ? candidate.id === slotId : candidate.kind === lane);
    if (!slot) return;
    const fake = { frame, detail: 0.35, history: { microChange: 0 } } as MusicalIntent;
    const pool = notePool(slot.patch);
    if (slot.kind === 'synth') this.voicing(slot, this.rootDegree(), 2, true).forEach((midi, voice) =>
      this.emit(slot, fake, time + voice * 0.18, midi, 3.6, 58 - voice * 8,
        voice ? 0.2 : -0.2, 'audition', 0.75));
    else this.emit(slot, fake, time, pool[Math.floor(pool.length * 0.52)], 1.2, 68, 0,
      'audition', 0.35);
  }

  finish(time: number) {
    this.stopped = true;
    this.events.push({ type: 'release', time });
  }

  drain() {
    const events = this.events;
    this.events = [];
    return events;
  }
}
