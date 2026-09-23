import { Platform } from "react-native";
import { AudioContext, AudioManager, PlaybackNotificationManager } from "react-native-audio-api";
import type { PlantPacket } from "../plant-packet";
import { sanitizeConfiguration, type Configuration } from "../sonora/presets";
import { GAP_SECONDS } from "../sonora/signal";
import type { Bank } from "../sonora/dsp";
import { SampleBank } from "./bank";
import { NativeSynth } from "./native-synth";
import { WaveComposer } from "../wave-music/composer";
import { waveMood } from "../wave-music/registry";
import { publishWaveInspection } from "../wave-music/inspection";

type Settings = { config: Configuration; bank: Bank };

/** BLE drives the composer; a buffered PCM transport plays the complete Sonora DSP. */
export class NativeAudio {
  private context: AudioContext | null = null;
  private synth: NativeSynth | null = null;
  private waves: WaveComposer | null = null;
  private bank = new SampleBank();
  private currentSettings: Settings | null = null;
  private subscriptions: { remove(): void }[] = [];
  private lastDecisionRevision = -1;
  private lastDecisionTime = -Infinity;
  private lastInspectionRevision = -1;
  private closed = false;
  private playing = false;
  private muted = false;
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
        void this.setMuted(false).catch(this.onError);
      }),
      PlaybackNotificationManager.addEventListener("playbackNotificationPause", () => {
        void this.setMuted(true).catch(this.onError);
      }),
      PlaybackNotificationManager.addEventListener("playbackNotificationStop", this.onStop),
      PlaybackNotificationManager.addEventListener("playbackNotificationDismissed", this.onStop),
      AudioManager.addSystemEventListener("routeChange", (event) => {
        if (event.reason === "OldDeviceUnavailable")
          void this.setMuted(true).catch(this.onError);
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
    this.muted = false;
    this.onPlaying(true);
  }

  private resetComposition() {
    if (!this.currentSettings) return;
    this.waves?.finish(this.context?.currentTime ?? 0);
    this.waves = null;
    this.lastDecisionRevision = -1;
    this.lastDecisionTime = -Infinity;
    this.lastInspectionRevision = -1;
    publishWaveInspection(null);
    const config = this.currentSettings.config;
    const mood = waveMood(config.profile);
    if (mood) {
      this.waves = new WaveComposer(config, mood, () => {
        if (!this.context || !this.playing || this.closed) return;
        this.waves?.advance(this.context.currentTime);
        this.synth?.events(this.waves?.drain() ?? []);
        this.publishInspection();
      }, error => {
        void this.setPlaying(false).catch(this.onError);
        this.onError(error);
      });
      this.publishInspection();
      return;
    }
    throw new Error(`Mood de ondas no registrado: ${config.profile}`);
  }

  private publishInspection() {
    if (!this.waves || this.waves.revisionId === this.lastInspectionRevision) return;
    this.lastInspectionRevision = this.waves.revisionId;
    publishWaveInspection({ ...this.waves.inspection, queueSeconds: this.synth?.diagnostics.queuedSeconds ?? 0 });
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
        const music = this.waves;
        music?.advance(now);
        this.synth?.events(music?.drain() ?? []);
        this.publishInspection();
      });
      this.resetComposition();
    } else {
      const now = this.context.currentTime;
      const switchingEngine = !this.waves || current?.config.profile !== config.profile;
      if (switchingEngine) {
        const previous = this.waves;
        previous?.finish(now);
        this.synth.events(previous?.drain() ?? []);
        this.resetComposition();
      } else (this.waves)?.configure(config, now);
      this.synth.configure(config, bank);
      this.synth.events((this.waves)?.drain() ?? []);
    }
  }

  push(packet: PlantPacket) {
    if (!this.context || !this.playing || this.closed) return;
    if (this.waves) {
      const now = this.context.currentTime;
      try {
        if (this.waves.push(packet, now)) this.synth?.activity(now + GAP_SECONDS);
        this.waves.advance(now);
        this.synth?.events(this.waves.drain());
        this.publishInspection();
        if (this.waves.revisionId !== this.lastDecisionRevision && now - this.lastDecisionTime >= 0.75) {
          const decision = this.waves.diagnostics;
          this.lastDecisionRevision = decision.revision; this.lastDecisionTime = now;
          console.info('[Plantia Music]', JSON.stringify({ event: 'LISTEN', ...decision }));
        }
      } catch (error) {
        void this.setPlaying(false).catch(this.onError);
        this.onError(error);
      }
      return;
    }
  }

  preview(lane: string) {
    const music = this.waves;
    if (!this.context || !this.playing || this.closed || !music) return;
    try {
      const now = this.context.currentTime;
      music.audition(lane, now);
      const events = music.drain();
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
        this.waves?.finish(this.context.currentTime);
        publishWaveInspection(null);
        this.synth?.silence();
        // Only transport pause/stop waits for a short fade, never audio refill.
        if (!interruption) await new Promise((resolve) => setTimeout(resolve, 40));
        if (this.closed) return;
        await this.context.suspend();
        this.synth?.reset();
      }
      if (this.closed) return;
      this.playing = value;
      this.onPlaying(value && !this.muted);
      await PlaybackNotificationManager.show({ state: value && !this.muted ? "playing" : "paused" });
    });
    this.queue = operation;
    return operation;
  }

  setMuted(value: boolean): Promise<void> {
    const operation = this.queue.catch(() => {}).then(async () => {
      if (!this.context || this.closed || !this.playing || this.muted === value) return;
      this.muted = value;
      this.synth?.setMuted(value);
      this.onPlaying(!value);
      await PlaybackNotificationManager.show({ state: value ? "paused" : "playing" });
    });
    this.queue = operation;
    return operation;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.waves?.finish(this.context?.currentTime ?? 0);
    publishWaveInspection(null);
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
    this.waves = null;
    this.currentSettings = null;
    this.bank = new SampleBank();
    this.playing = false;
    this.muted = false;
    this.onPlaying(false);
    AudioManager.observeAudioInterruptions(false);
    await PlaybackNotificationManager.hide();
    await AudioManager.setAudioSessionActivity(false);
  }
}
