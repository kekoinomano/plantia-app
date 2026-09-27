import { requireOptionalNativeModule } from "expo";
import { prepareVoice, modelId, type Bank, type Sample } from "../sonora/dsp";
import type { Event, Lane } from "../sonora/music-types";
import { audioChannels, type Configuration, type Patch } from "../sonora/presets";
import { preset } from '../sonora/presets';
import { palettePresets } from '../sonora/focus';
import { sfzInstrument } from './sfz-library';

type Module = {
  create(rate: number): number;
  destroy(id: number): void;
  configure(id: number, values: number[]): void;
  schedule(id: number, values: number[]): void;
  sample(id: number, key: number, bytes: Uint8Array): void;
  loadSfz(id: number, key: number, lane: number, path: string, gain: number, tuning: number): void;
  scheduleSfz(id: number, time: number, key: number, note: number, velocity: number, duration: number): void;
  retain(id: number, keys: number[]): void;
  render(id: number, frames: number): Uint8Array;
  status(id: number): number[];
};
const lanes: Lane[] = ["synth", "instrument", "greeting"];
const families = ["", "glass", "plume", "choir", "strings", "reed"];
const patch = (level: number, p: Patch) => [level, +p.delay.on, p.delay.wet, p.delay.rate,
  +p.chorus.on, p.chorus.depth, p.chorus.rate, +p.reverb.on, p.reverb.wet, p.reverb.amount];

/** Preset/note preparation stays in TS; only the per-sample loop is compiled. */
export class NativePcmCore {
  private module: Module;
  private id: number;
  private samples = new Map<Sample, [number, number?]>();
  private nextSample = 1;
  private cursor = 0;
  private channels: ReturnType<typeof audioChannels> = [];
  private sfzChannels = new Map<string, { id: number; channel: number; program: string; signature: string }>();
  private nextSfzId = 1;
  private state = { voices: 0, pending: 0 };

  constructor(private rate: number, config: Configuration, private bank: Bank) {
    const module = requireOptionalNativeModule<Module>("PlantiaPcm");
    if (!module) {
      const message = "Falta PlantiaPcm en esta instalación. Recompila con npm run android o, en iOS, npx pod-install y npm run ios; recargar Metro no instala el módulo nativo.";
      console.error("[Plantia PCM] NATIVE_MODULE_MISSING", message);
      throw new Error(message);
    }
    this.module = module;
    this.id = module.create(rate);
    try { this.configure(config, bank); }
    catch (error) { this.close(); throw error; }
  }

  configure(config: Configuration, bank: Bank) {
    this.bank = bank;
    const retained = new Set(Object.values(bank).flat());
    for (const s of retained) {
      if (this.samples.has(s)) continue;
      const key = this.nextSample++;
      this.module.sample(this.id, key, new Uint8Array(s.data.buffer, s.data.byteOffset, s.data.byteLength));
      let rightKey: number | undefined;
      if (s.right) {
        rightKey = this.nextSample++;
        this.module.sample(this.id, rightKey, new Uint8Array(s.right.buffer, s.right.byteOffset, s.right.byteLength));
      }
      this.samples.set(s, [key, rightKey]);
    }
    for (const s of this.samples.keys()) if (!retained.has(s)) this.samples.delete(s);
    this.module.retain(this.id, [...this.samples.values()].flatMap(([left, right]) => right ? [left, right] : [left]));
    const channels = audioChannels(config);
    const reset = channels.map((c) => c.id).join('|') !== this.channels.map((c) => c.id).join('|');
    this.channels = channels;
    this.module.configure(this.id, [
      +reset, ...channels.flatMap((c) => [lanes.indexOf(c.kind), ...patch(c.level, c.patch)]),
    ]);
    if (reset) this.sfzChannels.clear();
    const allowed = new Set(palettePresets(config.profile).map(id => preset(id).program));
    for (const channel of channels) allowed.add(preset(channel.patch.preset).program);
    for (const [address, layer] of this.sfzChannels) {
      if (channels[layer.channel]?.level > 0 && allowed.has(layer.program)) continue;
      this.module.loadSfz(this.id, layer.id, layer.channel, '', 0, 440);
      this.sfzChannels.delete(address);
    }
    channels.forEach((channel, index) => {
      const program = preset(channel.patch.preset).program;
      if (program && channel.level > 0) this.activateSfz(index, program, channel.patch.tuning);
    });
  }

  private activateSfz(channel: number, program: string, tuning: number): number | undefined {
    const sfz = sfzInstrument(program);
    if (!sfz) return;
    const address = `${channel}:${program}`;
    const signature = `${sfz.path}|${tuning}`;
    const previous = this.sfzChannels.get(address);
    if (previous?.signature === signature) return previous.id;
    const id = previous?.id ?? this.nextSfzId++;
    this.module.loadSfz(this.id, id, channel, sfz.path, sfz.gain, tuning);
    console.info('[Plantia Audio]', JSON.stringify({ event: 'SFZ_LOADED', program, channel }));
    this.sfzChannels.set(address, { id, channel, program, signature });
    return id;
  }

  schedule(events: Event[]) {
    for (const e of events) {
      if (e.type === "expression") this.module.schedule(this.id,
        [1, e.time, e.expression.brightness, e.expression.energy, e.expression.direction, ...e.expression.bands,
          e.expression.space ?? 0, e.expression.smoothing ?? 0.4]);
      else if (e.type === "release") {
        const index = e.slot ? this.channels.findIndex((c) => c.id === e.slot) : e.lane ? this.channels.findIndex((c) => c.kind === e.lane) : -1;
        if ((e.slot || e.lane) && index < 0) continue;
        this.module.schedule(this.id, [2, e.time, index]);
      }
      else {
        const channel = this.channels.findIndex((c) => e.note.slot ? c.id === e.note.slot : c.kind === e.note.lane);
        if (channel < 0) continue;
        const program = preset(e.note.patch.preset).program;
        const sfz = program ? sfzInstrument(program) : undefined;
        const sfzId = sfz && this.channels[channel].level > 0
          ? this.activateSfz(channel, program!, e.note.patch.tuning) : undefined;
        if (sfzId !== undefined) {
          let midi = sfz?.fixedNote ?? Math.round(e.note.midi);
          while (sfz?.minNote !== undefined && midi < sfz.minNote) midi += 12;
          while (sfz?.maxNote !== undefined && midi > sfz.maxNote) midi -= 12;
          if (e.note.velocity > 0) this.module.scheduleSfz(this.id, e.time, sfzId,
            Math.max(0, Math.min(127, midi)),
            Math.max(1, Math.min(127, Math.round(e.note.velocity * 1.27))),
            Math.max(0.01, e.note.duration));
          continue;
        }
        const v = prepareVoice(this.rate, this.bank, e.note);
        if (!v) continue;
        this.module.schedule(this.id, [0, e.time, e.note.id, e.note.time, e.note.sourceTime,
          channel, v.stop, v.attack, v.release,
          v.sample ? this.samples.get(v.sample)![0] : 0, v.sample2 ? this.samples.get(v.sample2)![0] : 0,
          v.increment, v.increment2, v.detuneRatio, v.frequency, v.attenuation, v.panL, v.panR, v.gain,
          e.note.color, e.note.pan, modelId(v.model),
          Math.max(0, families.indexOf(v.design.family)), v.design.evolution, v.design.decay,
          v.design.blend, v.design.trace, ...v.harmonics, ...v.ratios, v.phase, v.phase2,
          v.sample ? this.samples.get(v.sample)![1] ?? 0 : 0]);
      }
    }
    this.refresh();
  }

  render(left: Float32Array, right: Float32Array) {
    const bytes = this.module.render(this.id, left.length);
    const pcm = new Float32Array(bytes.buffer, bytes.byteOffset, left.length * 2);
    left.set(pcm.subarray(0, left.length)); right.set(pcm.subarray(left.length));
    this.refresh();
  }
  private refresh() {
    const [time, voices, pending] = this.module.status(this.id);
    this.cursor = time; this.state = { voices, pending };
  }
  close() { this.module.destroy(this.id); this.samples.clear(); }
  get time() { return this.cursor; }
  get status() { return this.state; }
}
