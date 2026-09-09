import { Asset } from "expo-asset";
import type { AudioContext } from "react-native-audio-api";
import { preset, type Configuration } from "../sonora/presets";
import type { Bank, Sample } from "../sonora/dsp";
import { sampleAssets } from "./sample-assets";

export class SampleBank {
  private cache = new Map<string, Promise<Sample[]>>();

  async load(config: Configuration, context: AudioContext): Promise<Bank> {
    const program = preset(config.instrument.preset).program;
    const needed = new Set([
      ...(program === "choir_organ" ? ["choir_aahs", "church_organ"] : program ? [program] : []),
    ]);
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
                const mono = new Float32Array(buffer.length);
                for (let c = 0; c < buffer.numberOfChannels; c++) {
                  const channel = buffer.getChannelData(c);
                  for (let i = 0; i < mono.length; i++)
                    mono[i] += channel[i] / buffer.numberOfChannels;
                }
                let peak = 0;
                for (const x of mono) peak = Math.max(peak, Math.abs(x));
                let start = 0;
                while (start < mono.length && Math.abs(mono[start]) < peak * 0.004) start++;
                const data = mono.slice(Math.max(0, start - 32));
                const gain = peak > 0.001 ? 0.85 / peak : 1;
                for (let i = 0; i < data.length; i++) data[i] *= gain;
                return { midi: entry.midi, rate: buffer.sampleRate, data };
              }),
            ).catch((error) => {
              this.cache.delete(name);
              throw error;
            }),
          );
        bank[name] = await this.cache.get(name)!;
      }),
    );
    for (const name of this.cache.keys()) if (!needed.has(name)) this.cache.delete(name);
    return bank;
  }
}
