import { Platform } from "react-native";
import {
  AudioContext,
  AudioManager,
  PlaybackNotificationManager,
  type WorkletSourceNode,
} from "react-native-audio-api";
import { createSynchronizable } from "react-native-worklets";
import type { LiveMusicEngine } from "../plant-live-engine";
import type { PlantPacket } from "../plant-packet";
import { sanitizeConfiguration, type Configuration } from "../sonora/presets";
import type { Bank } from "../sonora/dsp";
import type { Lane } from "../sonora/composer";
import { SampleBank } from "./bank";
import { createSonoraEngine } from "./sonora-runtime";

type Settings = { revision: number; config: Configuration; bank: Bank };
type RuntimeState = {
  engine: LiveMusicEngine;
  revision: number;
  sequence: number;
  audition: number;
  reset: number;
};
type AudioGlobal = typeof globalThis & { plantiaSonora?: RuntimeState };

/** PCM is pulled by the native audio clock, independently of React and JS timers. */
export class NativeAudio {
  private context: AudioContext | null = null;
  private node: WorkletSourceNode | null = null;
  private bank = new SampleBank();
  private settings = createSynchronizable<Settings | null>(null);
  private packets = createSynchronizable<PlantPacket[]>([]);
  private audition = createSynchronizable<{ id: number; lane: Lane }>({
    id: 0,
    lane: "instrument",
  });
  private reset = createSynchronizable(0);
  private history: PlantPacket[] = [];
  private subscriptions: { remove(): void }[] = [];
  private origin = 0;
  private revision = 0;
  private closed = false;
  private playing = false;
  private resumeAfterInterruption = false;
  private configureVersion = 0;
  private queue = Promise.resolve();

  constructor(
    private onPlaying: (playing: boolean) => void,
    private onError: (error: unknown) => void,
    private onStop: () => void,
  ) {}

  async start(config: Configuration) {
    AudioManager.setAudioSessionOptions({
      iosCategory: "playback",
      iosMode: "default",
      iosOptions: [],
    });
    const context = new AudioContext({ sampleRate: 44100 });
    this.context = context;
    await this.configure(config);
    if (this.closed) return;
    // The notification starts Android's mediaPlayback foreground service.
    if (Platform.OS === "android") await AudioManager.requestNotificationPermissions();
    if (this.closed) return;
    await PlaybackNotificationManager.show({
      title: "La música de tu planta",
      artist: "Plantia · Sonora",
      state: "playing",
    });
    await PlaybackNotificationManager.enableControl("play", true);
    await PlaybackNotificationManager.enableControl("pause", true);
    await PlaybackNotificationManager.enableControl("stop", true);
    if (this.closed) {
      await PlaybackNotificationManager.hide();
      return;
    }
    AudioManager.observeAudioInterruptions(true);
    await AudioManager.setAudioSessionActivity(true);
    if (this.closed) return;
    const settings = this.settings,
      packets = this.packets,
      audition = this.audition,
      reset = this.reset;
    const rate = context.sampleRate;
    const origin = (this.origin = context.currentTime);
    this.node = context.createWorkletSourceNode((channels, frames, currentTime) => {
      "worklet";
      const next = settings.getDirty();
      if (!next || channels.length < 2) return;
      const host = globalThis as AudioGlobal;
      const resetId = reset.getDirty();
      let state = host.plantiaSonora;
      if (!state || state.reset !== resetId) {
        state = host.plantiaSonora = {
          engine: createSonoraEngine(
            rate,
            Math.max(0, currentTime - origin),
            next.config,
            next.bank,
          ),
          revision: next.revision,
          sequence: -1,
          audition: audition.getDirty().id,
          reset: resetId,
        };
      }
      if (state.revision !== next.revision) {
        state.engine.configure(next.config, next.bank);
        state.revision = next.revision;
      }
      for (const packet of packets.getDirty()) {
        if (packet.seq <= state.sequence) continue;
        state.sequence = packet.seq;
        // Do not replay queued notifications after an interruption/suspension.
        if (packet.elapsed_ms / 1000 >= currentTime - origin - 1.5) state.engine.push(packet);
      }
      const preview = audition.getDirty();
      if (preview.id !== state.audition) {
        state.audition = preview.id;
        state.engine.audition(preview.lane);
      }
      const left = channels[0].length === frames ? channels[0] : channels[0].subarray(0, frames);
      const right = channels[1].length === frames ? channels[1] : channels[1].subarray(0, frames);
      state.engine.render(left, right);
    }, "AudioRuntime");
    this.node.connect(context.destination);
    this.node.start();
    await context.resume();
    if (this.closed) return;
    this.playing = true;
    this.onPlaying(true);
    this.subscriptions = [
      PlaybackNotificationManager.addEventListener("playbackNotificationPlay", () => {
        void this.setPlaying(true).catch(this.onError);
      }),
      PlaybackNotificationManager.addEventListener("playbackNotificationPause", () => {
        void this.setPlaying(false).catch(this.onError);
      }),
      PlaybackNotificationManager.addEventListener("playbackNotificationStop", this.onStop),
      PlaybackNotificationManager.addEventListener("playbackNotificationDismissed", this.onStop),
      AudioManager.addSystemEventListener("routeChange", (event) => {
        if (event.reason === "OldDeviceUnavailable")
          void this.setPlaying(false).catch(this.onError);
      }),
      AudioManager.addSystemEventListener("interruption", (event) => {
        if (event.type === "began") {
          this.resumeAfterInterruption = this.playing;
          void this.setPlaying(false, true).catch(this.onError);
        } else if (event.shouldResume && this.resumeAfterInterruption) {
          this.resumeAfterInterruption = false;
          void this.setPlaying(true).catch(this.onError);
        }
      }),
    ].filter((s) => s != null);
  }

  async configure(input: Configuration) {
    const version = ++this.configureVersion;
    const config = sanitizeConfiguration(input);
    if (!this.context || this.closed) return;
    const current = this.settings.getBlocking();
    const bank =
      current?.config.instrument.preset === config.instrument.preset
        ? current.bank
        : await this.bank.load(config, this.context);
    if (this.closed || version !== this.configureVersion) return;
    this.settings.setBlocking({ config, bank, revision: ++this.revision });
  }

  push(packet: PlantPacket) {
    if (!this.context || !this.playing || this.closed) return;
    this.history.push({
      ...packet,
      elapsed_ms: Math.max(0, this.context.currentTime - this.origin) * 1000,
    });
    this.history = this.history.slice(-16);
    // Copy before handing it to the audio thread: that object gets sealed.
    this.packets.setBlocking([...this.history]);
  }

  preview(lane: Lane) {
    if (!this.playing) return;
    this.audition.setBlocking({ id: this.audition.getBlocking().id + 1, lane });
  }

  setPlaying(value: boolean, interruption = false): Promise<void> {
    if (!interruption) this.resumeAfterInterruption = false;
    const operation = this.queue
      .catch(() => {})
      .then(async () => {
        if (!this.context || this.closed || this.playing === value) return;
        if (value) {
          this.history = [];
          this.packets.setBlocking([]);
          this.reset.setBlocking(this.reset.getBlocking() + 1);
          await AudioManager.setAudioSessionActivity(true);
          await this.context.resume();
        } else {
          await this.context.suspend();
        }
        if (this.closed) return;
        this.playing = value;
        this.onPlaying(value);
        await PlaybackNotificationManager.show({ state: value ? "playing" : "paused" });
      });
    this.queue = operation;
    return operation;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.configureVersion++;
    this.subscriptions.forEach((s) => s.remove());
    this.subscriptions = [];
    await this.queue.catch(() => {});
    this.node?.stop();
    this.node?.disconnect();
    await this.context?.close();
    this.context = null;
    this.node = null;
    this.history = [];
    this.settings.setBlocking(null);
    this.packets.setBlocking([]);
    this.playing = false;
    this.onPlaying(false);
    AudioManager.observeAudioInterruptions(false);
    await PlaybackNotificationManager.hide();
    await AudioManager.setAudioSessionActivity(false);
  }
}
