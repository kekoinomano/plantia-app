import {
  BiquadFilterNode, DelayNode, GainNode,
  type AudioBuffer, type AudioContext, type AudioNode, type AudioParam,
  type AudioScheduledSourceNode, type ConstantSourceNode,
  type OscillatorNode, type PeriodicWave,
} from "react-native-audio-api";
import type { Bank, Sample } from "../sonora/dsp";
import type { Event, Lane, Note } from "../sonora/composer";
import { copyPatch, preset, type Configuration, type Patch } from "../sonora/presets";
import { synthVoice } from "../sonora/synth-voices";

const LANES: Lane[] = ["synth", "instrument", "greeting"];
const LIMIT = { synth: 6, instrument: 8, greeting: 4 };
const LEAD = 0.05;
const CHORUS_DELAY = 0.02;
const CHORUS_CENTS = 32;
const STEREO = { channelCount: 2, channelCountMode: "explicit" as const };
const ATTACK = Float32Array.from({ length: 32 }, (_, i) => {
  const t = i / 31;
  return t * t * (3 - 2 * t);
});
const RELEASE = ATTACK.map((x) => 1 - x);

type Bus = {
  input: GainNode;
  filter: BiquadFilterNode;
  expression: GainNode;
  level: GainNode;
  duck: GainNode;
  echo: { input: GainNode; nodes: AudioNode[]; wet: GainNode[]; rate: number; created: number } | null;
  delay: Patch["delay"];
  lfo: OscillatorNode;
  modulation: GainNode;
  rooms: GainNode[];
};
type Voice = {
  lane: Lane;
  gate: GainNode;
  sources: AudioScheduledSourceNode[];
  modulated: AudioParam[];
  nodes: AudioNode[];
  end: number;
  released: boolean;
};

function smooth(param: AudioParam, value: number, time: number, seconds = 0.08) {
  param.cancelAndHoldAtTime(time);
  param.linearRampToValueAtTime(value, time + seconds);
}

/** JS sends notes, never PCM blocks. Oscillators, samples, envelopes and effects
 * run in the library's native audio graph, including their scheduled endings. */
export class NativeSynth {
  private nodes: AudioNode[] = [];
  private voices: Voice[] = [];
  private buffers = new WeakMap<Sample, AudioBuffer>();
  private waves = new Map<string, PeriodicWave>();
  private buses: Record<Lane, Bus>;
  private output: GainNode;
  private keepAlive: ConstantSourceNode;
  private retired: { source: AudioNode; nodes: AudioNode[]; end: number }[] = [];
  private bank: Bank;
  private holdUntil = 0;

  constructor(private context: AudioContext, config: Configuration, bank: Bank) {
    this.bank = bank;
    const mix = this.keep(this.gain());
    const dc = this.keep(new BiquadFilterNode(context, STEREO));
    dc.type = "highpass";
    dc.frequency.value = 18;
    dc.Q.value = 0.707;
    const limiter = this.keep(context.createWaveShaper());
    limiter.curve = Float32Array.from({ length: 2049 }, (_, i) =>
      0.9 * Math.tanh((i / 1024 - 1) * 1.65),
    );
    this.output = this.keep(this.gain());
    this.output.gain.value = 0;
    mix.connect(dc).connect(limiter).connect(this.output).connect(context.destination);

    // Two shared native reverbs; room size crossfades their sends without
    // rebuilding an impulse or interrupting an existing tail during playback.
    const rooms = [0.35, 1.2].map((seconds) => {
      // 0.13.3's convolver already has a separate output buffer. Give it a
      // private explicit mixer as input; its internal wet path uses mode max.
      const feed = this.keep(this.gain());
      const node = this.keep(context.createConvolver());
      node.normalize = false;
      node.buffer = this.impulse(seconds);
      feed.connect(node).connect(mix);
      return feed;
    });
    // Keep the effect buses enabled across gaps between notes. Their delay/
    // convolution history then drains naturally instead of being disabled and
    // re-enabled while an earlier tail is still pending in audio-api 0.13.3.
    this.keepAlive = this.keep(context.createConstantSource());
    this.keepAlive.offset.value = 0;
    this.keepAlive.start();
    this.buses = Object.fromEntries(LANES.map((lane) => {
      const input = this.keep(this.gain());
      this.keepAlive.connect(input);
      const filter = this.keep(new BiquadFilterNode(context, STEREO));
      filter.type = "lowpass";
      filter.frequency.value = Math.min(12000, context.sampleRate * 0.4);
      filter.Q.value = 0.5;
      const expression = this.keep(this.gain());
      const level = this.keep(this.gain());
      const duck = this.keep(this.gain());
      input.connect(filter).connect(expression).connect(level).connect(duck).connect(mix);

      const lfo = this.keep(context.createOscillator());
      lfo.frequency.value = 0.2;
      // Chorus uses a delayed, pitch-modulated copy of each source. Native
      // playback preserves phase/position; modulating this version's DelayNode
      // instead moves an integer write position and leaves holes/overlaps.
      const modulation = this.keep(this.gain(1, CHORUS_CENTS * 0.2));
      lfo.connect(modulation);
      lfo.start();
      const sends = rooms.map((room) => {
        const send = this.keep(this.gain());
        send.gain.value = 0;
        duck.connect(send).connect(room);
        return send;
      });
      return [lane, { input, filter, expression, level, duck, echo: null,
        delay: { on: false, wet: 0, rate: 50 }, lfo, modulation, rooms: sends }];
    })) as Record<Lane, Bus>;
    this.mix = mix;
    this.configure(config, bank);
  }

  private mix: GainNode;

  private gain(channels = 2, gain = 1) {
    // In 0.13.3 mode "max" can process its upstream buffer in place, whereas
    // repeat graph visits return the node's own buffer. Explicit channels make
    // those the same buffer, isolated from every other dry/wet/LFO route.
    return new GainNode(this.context, { channelCount: channels, channelCountMode: "explicit", gain });
  }

  private updateEcho(bus: Bus, now: number) {
    const { on, wet, rate } = bus.delay;
    let echo = bus.echo;
    if (!echo || (echo.rate !== rate && now - echo.created >= 0.15)) {
      // Crossfade static delay lines when their rate changes. Never slide a
      // write head through live samples. Coalesce fast slider updates to keep
      // at most one retiring bank per bus (no playback timer is involved).
      if (echo) {
        echo.wet.forEach((node) => smooth(node.gain, 0, now, 0.08));
        this.retired.push({ source: bus.duck, nodes: echo.nodes, end: now + 0.09 });
      }
      const input = this.gain(2, 0), nodes: AudioNode[] = [input], gains: GainNode[] = [];
      bus.duck.connect(input);
      let previous: AudioNode = input;
      for (let i = 0; i < 3; i++) {
        const delay = new DelayNode(this.context, { ...STEREO, maxDelayTime: 1.3, delayTime: 0.07 + 1.1 * (1 - rate / 100) });
        const output = this.gain(2, 0);
        previous.connect(delay).connect(output).connect(this.mix);
        previous = delay;
        nodes.push(delay, output);
        gains.push(output);
      }
      echo = bus.echo = { input, nodes, wet: gains, rate, created: now };
      smooth(input.gain, 1, now);
    }
    echo.wet.forEach((node, i) => smooth(node.gain, on ? wet / 100 * 0.32 ** i : 0, now));
  }

  private keep<T extends AudioNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  private impulse(seconds: number) {
    const length = Math.ceil(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(2, length, this.context.sampleRate);
    let seed = 12345;
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      let low = 0;
      for (let i = 0; i < length; i++) {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        low = 0.5 * low + 0.5 * ((seed >>> 0) / 0x80000000 - 1);
        data[i] = i < this.context.sampleRate * 0.01 ? 0
          : low * (1 - i / length) ** 3 * 6 / Math.sqrt(length);
      }
    }
    return buffer;
  }

  configure(config: Configuration, bank: Bank) {
    this.bank = bank;
    const greeting: Patch = {
      ...copyPatch("harp"),
      delay: { on: true, wet: 12, rate: 77 },
      reverb: { on: true, wet: 42, amount: 76 },
      chorus: { on: true, depth: 25, rate: 13 },
    };
    const now = this.context.currentTime;
    for (const lane of LANES) {
      const patch = lane === "greeting" ? greeting : config[lane];
      const bus = this.buses[lane];
      smooth(bus.level.gain, config[`${lane}Level`], now);
      bus.delay = patch.delay;
      this.updateEcho(bus, now);
      const rate = 0.08 + patch.chorus.rate / 100 * 1.12;
      smooth(bus.lfo.frequency, rate, now);
      smooth(bus.modulation.gain, CHORUS_CENTS * rate, now);
      const wet = patch.reverb.on ? patch.reverb.wet / 100 : 0;
      smooth(bus.rooms[0].gain, wet * (1 - patch.reverb.amount / 100), now);
      smooth(bus.rooms[1].gain, wet * patch.reverb.amount / 100, now);
    }
    this.prune();
  }

  /** A native fade is already scheduled if BLE/JS falls silent. A late packet
   * fades back in instead of restarting an empty PCM stream with a hard edge. */
  activity(until: number) {
    const now = this.context.currentTime;
    this.holdUntil = Math.max(until, this.holdUntil);
    smooth(this.output.gain, 1, now);
    this.output.gain.setValueAtTime(1, this.holdUntil);
    this.output.gain.linearRampToValueAtTime(0, this.holdUntil + 0.4);
    this.prune();
    for (const lane of LANES) {
      const bus = this.buses[lane];
      if (bus.echo?.rate !== bus.delay.rate) this.updateEcho(bus, now);
    }
  }

  events(events: Event[]) {
    if (!events.length) return;
    const now = this.context.currentTime;
    // Shift a batch together, keeping chord/greeting offsets intact. Never
    // replay a backlog or require a JS timer to start/stop a note on time.
    const offset = Math.max(0, now + LEAD - Math.min(...events.map((e) => e.time)));
    this.prune();
    for (const event of events) {
      const when = event.time + offset;
      if (event.type === "note") this.note(event.note, when);
      else if (event.type === "release") {
        for (const voice of this.voices)
          if (!event.lane || voice.lane === event.lane) this.release(voice, when, 0.18);
      } else {
        const { brightness, energy } = event.expression;
        smooth(this.buses.synth.filter.frequency, Math.min(this.context.sampleRate * 0.4, 1500 + brightness * 10000), when, 0.18);
        smooth(this.buses.synth.expression.gain, 0.7 + energy * 0.3, when, 0.18);
      }
    }
  }

  private note(note: Note, when: number) {
    const same = this.voices.filter((v) => v.lane === note.lane);
    // Allow a tiny overlap for stolen voices to fade, with a hard allocation cap.
    if (same.length >= LIMIT[note.lane] + 2) return;
    const active = same.filter((v) => !v.released);
    if (active.length >= LIMIT[note.lane]) this.release(active[0], this.context.currentTime, 0.03);
    const nodes: AudioNode[] = [], sources: AudioScheduledSourceNode[] = [];
    const keep = <T extends AudioNode>(node: T): T => { nodes.push(node); return node; };
    const gate = keep(this.gain(1));
    const pan = keep(this.context.createStereoPanner());
    pan.pan.value = Math.max(-1, Math.min(1, note.pan));
    gate.connect(pan).connect(this.buses[note.lane].input);
    const greeting = note.lane === "greeting", synth = note.lane === "synth";
    const attack = Math.min(note.duration, greeting ? 0.14 : note.patch.envelope.on
      ? 0.004 + (synth ? 1.3 : 0.45) * (note.patch.envelope.attack / 100) ** 2 : synth ? 0.08 : 0.004);
    const release = greeting ? 2.8 : note.patch.envelope.on ? 0.06 + 3.5 * (note.patch.envelope.release / 100) ** 2 : 0.35;
    const volume = (greeting ? 0.34 : synth ? 0.17 : 0.2) * (note.velocity / 100) ** 1.15;
    const frequency = note.patch.tuning * 2 ** ((note.midi - 69) / 12);
    const chorus = greeting ? { on: true, depth: 25 } : note.patch.chorus;
    const layers = [{ offset: 0, level: 1, chorus: false }];
    if (chorus.on && chorus.depth > 0)
      layers.push({ offset: CHORUS_DELAY, level: chorus.depth / 100 * 0.35, chorus: true });
    const modulated: AudioParam[] = [];
    for (const layer of layers) {
      const at = when + layer.offset, end = at + note.duration + release;
      const envelope = keep(this.gain(1, 0));
      envelope.connect(gate);
      envelope.gain.setValueCurveAtTime(ATTACK.map((x) => x * volume * layer.level), at, attack);
      envelope.gain.setValueCurveAtTime(RELEASE.map((x) => x * volume * layer.level), at + note.duration, release);
      const oscillator = (hz: number, gain: number, decay = 0, wave?: PeriodicWave, detune = 0) => {
        const node = keep(this.context.createOscillator());
        node.frequency.value = hz;
        node.detune.value = detune;
        if (wave) node.setPeriodicWave(wave);
        if (layer.chorus) {
          this.buses[note.lane].modulation.connect(node.detune);
          modulated.push(node.detune);
        }
        const level = keep(this.gain(1));
        level.gain.setValueAtTime(gain, at);
        if (decay) level.gain.exponentialRampToValueAtTime(Math.max(0.00001, gain * Math.exp(-(end - at) * decay)), end);
        node.connect(level).connect(envelope);
        node.start(at);
        node.stop(end);
        sources.push(node);
      };
      if (synth) {
        const design = synthVoice(note.patch.preset);
        let wave = this.waves.get(note.patch.preset);
        if (!wave) {
          const scale = Math.min(1.6, 0.96 / Math.sqrt(design.harmonics.reduce((sum, x) => sum + x * x, 0)));
          wave = this.context.createPeriodicWave(new Float32Array(9), Float32Array.from([0, ...design.harmonics.map((x) => x * scale)]), { disableNormalization: true });
          this.waves.set(note.patch.preset, wave);
        }
        const attenuation = Math.min(1, Math.sqrt(880 / frequency));
        oscillator(frequency, attenuation * (1 - design.blend), design.decay * 0.15, wave);
        oscillator(frequency, attenuation * design.blend, design.decay * 0.15, wave, design.detune);
      } else {
        const desc = preset(note.patch.preset);
        const program = greeting ? "orchestral_harp" : desc.program;
        if (program) {
          const programs: [string, number][] = program === "choir_organ"
            ? [["choir_aahs", 0.6], ["church_organ", 0.4]] : [[program, 1]];
          for (const [name, gain] of programs) {
            const samples = this.bank[name];
            if (!samples?.length) continue;
            const sample = samples.reduce((a, b) => Math.abs(a.midi - note.midi) <= Math.abs(b.midi - note.midi) ? a : b);
            let buffer = this.buffers.get(sample);
            if (!buffer) {
              buffer = this.context.createBuffer(1, sample.data.length, sample.rate);
              buffer.getChannelData(0).set(sample.data);
              this.buffers.set(sample, buffer);
            }
            const node = keep(this.context.createBufferSource());
            node.buffer = buffer;
            const rate = 2 ** ((note.midi - sample.midi) / 12) * note.patch.tuning / 440;
            node.playbackRate.value = rate;
            if (layer.chorus) {
              this.buses[note.lane].modulation.connect(node.detune);
              modulated.push(node.detune);
            }
            const level = keep(this.gain(1));
            // Fade before even the fastest chorus playback can reach EOF.
            const fastest = rate * (layer.chorus ? 2 ** (CHORUS_CENTS * 1.2 / 1200) : 1);
            const sampleEnd = Math.min(end, at + buffer.duration / fastest);
            level.gain.setValueAtTime(gain, at);
            level.gain.setValueAtTime(gain, Math.max(at, sampleEnd - 0.015));
            level.gain.linearRampToValueAtTime(0, sampleEnd);
            node.connect(level).connect(envelope);
            node.start(at);
            node.stop(sampleEnd);
            sources.push(node);
          }
        } else {
          const bowl = desc.model === "bowl";
          (bowl ? [1, 2.71, 4.05, 5.43] : [1, 2, 3, 4]).forEach((ratio, i) => {
            if (frequency * ratio < this.context.sampleRate * 0.42)
              oscillator(frequency * ratio, i ? 0.3 / (i + 1) : 1, (1 + i * 0.6) / (bowl ? 2.8 : 1.4));
          });
        }
      }
    }
    this.voices.push({ lane: note.lane, gate, sources, modulated, nodes,
      end: when + note.duration + release + layers.at(-1)!.offset, released: false });
    if (greeting) for (const lane of ["synth", "instrument"] as const) {
      const duck = this.buses[lane].duck.gain;
      smooth(duck, 0.48, when);
      duck.setValueAtTime(0.48, when + 1.8);
      duck.linearRampToValueAtTime(1, when + 2.6);
    }
  }

  private release(voice: Voice, when: number, seconds: number) {
    if (voice.released || voice.end <= when) return;
    voice.released = true;
    voice.end = Math.min(voice.end, when + seconds);
    smooth(voice.gate.gain, 0, when, voice.end - when);
    voice.sources.forEach((source) => source.stop(voice.end));
  }

  private prune() {
    const now = this.context.currentTime;
    this.retired = this.retired.filter((entry) => {
      if (entry.end > now) return true;
      entry.source.disconnect(entry.nodes[0]);
      entry.nodes.forEach((node) => node.disconnect());
      return false;
    });
    this.voices = this.voices.filter((voice) => {
      if (voice.end + 0.01 > now) return true;
      voice.modulated.forEach((param) => this.buses[voice.lane].modulation.disconnect(param));
      voice.nodes.forEach((node) => node.disconnect());
      return false;
    });
    // No per-note JS callbacks: finished sources stop natively. At most the
    // bounded voice set remains connected if no more packets ever arrive.
  }

  silence() {
    this.holdUntil = 0;
    smooth(this.output.gain, 0, this.context.currentTime, 0.03);
  }

  reset() {
    this.voices.forEach((voice) => {
      voice.sources.forEach((source) => source.stop());
      voice.modulated.forEach((param) => this.buses[voice.lane].modulation.disconnect(param));
      voice.nodes.forEach((node) => node.disconnect());
    });
    this.voices = [];
    this.holdUntil = 0;
    this.output.gain.cancelScheduledValues(this.context.currentTime);
    this.output.gain.setValueAtTime(0, this.context.currentTime);
  }

  close() {
    this.reset();
    this.keepAlive.stop();
    LANES.forEach((lane) => {
      const bus = this.buses[lane];
      bus.lfo.stop();
      if (bus.echo) {
        bus.duck.disconnect(bus.echo.input);
        bus.echo.nodes.forEach((node) => node.disconnect());
        bus.echo = null;
      }
    });
    this.retired.forEach((entry) => {
      entry.source.disconnect(entry.nodes[0]);
      entry.nodes.forEach((node) => node.disconnect());
    });
    this.retired = [];
    this.nodes.forEach((node) => node.disconnect());
    this.nodes = [];
    this.waves.clear();
    this.buffers = new WeakMap();
    this.bank = {};
  }
}
