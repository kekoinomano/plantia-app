import { Platform } from "react-native";
import { AudioContext, AudioManager, PlaybackNotificationManager } from "react-native-audio-api";
import type { PlantPacket } from "../plant-packet";
import { sanitizeConfiguration, type Configuration } from "../sonora/presets";
import { Composer, type Lane } from "../sonora/composer";
import { createSignalAccumulator, GAP_SECONDS } from "../sonora/signal";
import type { Bank } from "../sonora/dsp";
import { SampleBank } from "./bank";
import { NativeSynth } from "./native-synth";

type Settings = { config: Configuration; bank: Bank };

/** BLE drives the composer; a buffered PCM transport plays the complete Sonora DSP. */
export class NativeAudio {
  private context: AudioContext | null = null;
  private synth: NativeSynth | null = null;
  private composer: Composer | null = null;
  private signal: ReturnType<typeof createSignalAccumulator> | null = null;
  private bank = new SampleBank();
  private currentSettings: Settings | null = null;
  private subscriptions: { remove(): void }[] = [];
  private lastSequence = -1;
  private closed = false;
  private playing = false;
  private resumeAfterInterruption = false;
  private configureVersion = 0;
  private queue = Promise.resolve();
  private starting: Promise<void> | null = null;

  constructor(
    private onPlaying: (playing: boolean) => void,
    private onError: (error: unknown) => void,
    private onStop: () => void,
  ) {}

  start(config: Configuration) {
    this.starting = this.begin(config).catch((error) => {
      console.error("[Plantia PCM] INIT_ERROR", error instanceof Error ? error.message : String(error));
      throw error;
    });
    return this.starting;
  }

  private async begin(config: Configuration) {
    AudioManager.setAudioSessionOptions({
      iosCategory: "playback",
      iosMode: "default",
      iosOptions: [],
    });
    // Render and enqueue at the hardware rate: no transport resampling.
    const context = new AudioContext();
    this.context = context;
    await context.suspend();
    if (this.closed) return;
    await this.configure(config);
    if (this.closed) return;
    // Starts the mediaPlayback | connectedDevice foreground service on Android.
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
    if (this.closed) return;
    AudioManager.observeAudioInterruptions(true);
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
    await AudioManager.setAudioSessionActivity(true);
    if (this.closed) return;
    await context.resume();
    if (this.closed) return;
    this.playing = true;
    this.onPlaying(true);
  }

  private resetComposition() {
    if (!this.currentSettings) return;
    this.composer = new Composer(this.currentSettings.config);
    this.lastSequence = -1;
    this.signal = createSignalAccumulator((frame) => {
      if (!this.context || !this.composer || this.context.currentTime - frame.time > GAP_SECONDS) return;
      this.composer.advance(frame.time);
      this.composer.push(frame);
      this.synth?.events(this.composer.drain());
    });
  }

  async configure(input: Configuration) {
    const version = ++this.configureVersion;
    const config = sanitizeConfiguration(input);
    if (!this.context || this.closed) return;
    const current = this.currentSettings;
    const bank = await this.bank.load(config, this.context);
    if (this.closed || version !== this.configureVersion) return;
    this.currentSettings = { config, bank };
    if (!this.synth) {
      this.synth = new NativeSynth(this.context, config, bank, (error) => {
        void this.setPlaying(false).catch(this.onError);
        this.onError(error);
      }, () => {
        if (!this.context || !this.playing) return;
        const now = this.context.currentTime;
        this.signal?.advance(now * 1000);
        this.composer?.advance(now);
        this.synth?.events(this.composer?.drain() ?? []);
      });
      this.resetComposition();
    } else {
      this.composer?.configure(config, this.context.currentTime);
      this.synth.configure(config, bank);
      this.synth.events(this.composer?.drain() ?? []);
    }
  }

  push(packet: PlantPacket) {
    if (!this.context || !this.playing || this.closed) return;
    if (packet.error || !packet.values || packet.values.length !== 10 ||
      !packet.values.every(Number.isFinite) || !Number.isSafeInteger(packet.seq) ||
      packet.seq <= this.lastSequence) return;
    this.lastSequence = packet.seq;
    const now = this.context.currentTime;
    try {
      this.synth?.activity(now + GAP_SECONDS);
      // Timestamp analysis with the hardware clock. The PCM adapter maps whole
      // event batches to the next unwritten samples, preserving musical offsets.
      this.signal?.push({ ...packet, elapsed_ms: now * 1000 });
    } catch (error) {
      void this.setPlaying(false).catch(this.onError);
      this.onError(error);
    }
  }

  preview(lane: string) {
    if (!this.context || !this.playing || this.closed || !this.composer) return;
    try {
      const now = this.context.currentTime;
      this.composer.audition(lane, now);
      const events = this.composer.drain();
      const end = Math.max(now, ...events.map((e) => e.type === "note" ? e.time + e.note.duration + 3.6 : e.time));
      this.synth?.activity(end + 0.05);
      this.synth?.events(events);
    } catch (error) {
      this.onError(error);
    }
  }

  setPlaying(value: boolean, interruption = false): Promise<void> {
    if (!interruption) this.resumeAfterInterruption = false;
    const operation = this.queue.catch(() => {}).then(async () => {
      if (!this.context || this.closed || this.playing === value) return;
      if (value) {
        this.resetComposition();
        await AudioManager.setAudioSessionActivity(true);
        if (this.closed) return;
        await this.context.resume();
      } else {
        this.playing = false;
        this.onPlaying(false);
        this.synth?.silence();
        // Only transport pause/stop waits for a short fade, never audio refill.
        if (!interruption) await new Promise((resolve) => setTimeout(resolve, 40));
        if (this.closed) return;
        await this.context.suspend();
        this.synth?.reset();
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
    await this.starting?.catch(() => {});
    this.subscriptions.forEach((s) => s.remove());
    this.subscriptions = [];
    await this.queue.catch(() => {});
    if (this.playing) {
      this.synth?.silence();
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    this.synth?.close();
    await this.context?.close();
    this.context = null;
    this.synth = null;
    this.composer = null;
    this.signal = null;
    this.currentSettings = null;
    this.bank = new SampleBank();
    this.playing = false;
    this.onPlaying(false);
    AudioManager.observeAudioInterruptions(false);
    await PlaybackNotificationManager.hide();
    await AudioManager.setAudioSessionActivity(false);
  }
}
