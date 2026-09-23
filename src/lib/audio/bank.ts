import { Asset } from "expo-asset";
import type { AudioContext } from "react-native-audio-api";
import { preset, type Configuration } from "../sonora/presets";
import type { Bank, Sample } from "../sonora/dsp";
import { sampleAssets } from "./sample-assets";
import { palettePresets } from "../sonora/focus";

export class SampleBank {
  private cache = new Map<string, Promise<Sample[]>>();
  private preparation: Promise<void> = Promise.resolve();

  private async prepare(buffer: Awaited<ReturnType<AudioContext['decodeAudioData']>>) {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
    const mono = new Float32Array(buffer.length);
    let peak = 0, budgetAt = performance.now();
    const yieldIfNeeded = async () => {
      if (performance.now() - budgetAt < 4) return;
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      budgetAt = performance.now();
    };
    for (let offset = 0; offset < mono.length; offset += 8192) {
      const end = Math.min(mono.length, offset + 8192);
      for (let i = offset; i < end; i++) {
        let value = 0;
        for (const channel of channels) value += channel[i] / channels.length;
        mono[i] = value; peak = Math.max(peak, Math.abs(value));
      }
      await yieldIfNeeded();
    }
    let start = 0;
    while (start < mono.length && Math.abs(mono[start]) < peak * 0.004) {
      start++;
      if (start % 8192 === 0) await yieldIfNeeded();
    }
    const data = mono.subarray(Math.max(0, start - 32));
    const gain = peak > 0.001 ? 0.85 / peak : 1;
    for (let offset = 0; offset < data.length; offset += 8192) {
      const end = Math.min(data.length, offset + 8192);
      for (let i = offset; i < end; i++) data[i] *= gain;
      await yieldIfNeeded();
    }
    return { rate: buffer.sampleRate, data };
  }

  async load(config: Configuration, context: AudioContext): Promise<Bank> {
    const needed = new Set(palettePresets(config.profile).flatMap((id) => {
      const program = preset(id).program;
      return program === "choir_organ" ? ["choir_aahs", "church_organ"] : program ? [program] : [];
    }));
    const bank: Bank = {};
    await Promise.all(
      [...needed].map(async (name) => {
        if (!this.cache.has(name))
          this.cache.set(
            name,
            Promise.all(
              sampleAssets[name].map(async (entry) => {
                const asset = await Asset.fromModule(entry.asset).downloadAsync();
                const buffer = await context.decodeAudioData(asset.localUri ?? asset.uri);
                // Only one CPU preparation job at a time; each yields to
                // presses/BLE after a small budget rather than blocking a mood change.
                const prepared = this.preparation.then(() => this.prepare(buffer));
                this.preparation = prepared.then(() => {}, () => {});
                return { midi: entry.midi, ...(await prepared) };
              }),
            ).catch((error) => {
              this.cache.delete(name);
              throw error;
            }),
          );
        bank[name] = await this.cache.get(name)!;
      }),
    );
    // Retain a small LRU of decoded programs so switching back to a recent mood
    // doesn't decode and normalize the same samples all over again.
    for (const name of needed) {
      const entry = this.cache.get(name);
      if (entry) { this.cache.delete(name); this.cache.set(name, entry); }
    }
    for (const name of this.cache.keys()) {
      if (this.cache.size <= Math.max(8, needed.size)) break;
      if (!needed.has(name)) this.cache.delete(name);
    }
    return bank;
  }
}
