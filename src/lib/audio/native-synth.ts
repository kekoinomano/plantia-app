import type { AudioBufferQueueSourceNode, AudioContext, GainNode } from "react-native-audio-api";
import type { Bank } from "../sonora/dsp";
import { NativePcmCore } from "./native-pcm";
import { Platform } from "react-native";
import type { Event } from "../sonora/composer";
import type { Configuration } from "../sonora/presets";

const BLOCK_SECONDS = 0.04;
const MIN_RESERVE = 0.12;
const MAX_RESERVE = 0.6;
const FADE = 0.015;
const SILENT = 0.00001;

/** One continuous Sonora renderer feeds a small native PCM queue. The device
 * callback only copies finished samples; effects never run on its deadline. */
export class NativeSynth {
  private core: NativePcmCore;
  private output: GainNode;
  private source: AudioBufferQueueSourceNode | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private pumping = false;
  private closed = false;
  private muted = false;
  private active = false;
  private started = false;
  private prepared = 0;
  private end = 0;
  private fadeInAt = 0;
  private holdUntil = 0;
  private quietSeconds = 0;
  private reserve = MIN_RESERVE;
  private minimumReserve = MIN_RESERVE;
  private peak = 0;
  private lastLog = 0;
  private lastPacket = 0;
  private renderPeak = 0;
  private underruns = 0;
  private blocks = 0;
  private lastRenderMs = 0;
  private frames: number;
  private blockSeconds: number;

  constructor(
    private context: AudioContext,
    private config: Configuration,
    private bank: Bank,
    private onError: (error: unknown) => void = () => {},
    private advance: () => void = () => {},
  ) {
    this.core = new NativePcmCore(context.sampleRate, config, bank);
    this.frames = Math.ceil(context.sampleRate * BLOCK_SECONDS / 128) * 128;
    this.blockSeconds = this.frames / context.sampleRate;
    this.output = context.createGain();
    this.output.gain.value = 0;
    this.output.connect(context.destination);
    this.log("INIT");

  }

  configure(config: Configuration, bank: Bank) {
    this.config = config;
    this.bank = bank;
    // Preserve oscillators, scheduled releases and the entire effects history.
    this.core.configure(config, bank);
  }

  events(events: Event[]) {
    if (this.closed || this.muted || !events.length) return;
    // As with the native note scheduler, shift late batches together. The next
    // unwritten sample is the earliest possible onset. Convert ALL note times,
    // preserve chord offsets and never insert events into already rendered PCM.
    const anchor = Math.min(this.context.currentTime, ...events.map((e) => e.time));
    const offset = this.core.time - anchor;
    this.core.schedule(events.map((e): Event => ({
      ...e,
      time: e.time + offset,
      ...(e.type === "note" ? { note: {
        ...e.note, time: e.note.time + offset, sourceTime: e.note.sourceTime + offset,
      } } : {}),
    })));
    this.active = true;
    this.quietSeconds = 0;
    this.wake();
  }

  activity(until: number) {
    this.holdUntil = Math.max(this.holdUntil, until);
    this.lastPacket = this.context.currentTime;
  }

  private remaining() {
    return this.started ? Math.max(0, this.end - this.context.currentTime) : this.prepared;
  }

  private wake(delay = 0) {
    if (this.closed || this.muted || !this.active || this.pumping) return;
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.pump();
    }, delay);
  }

  private newQueue() {
    this.disposeQueue();
    const source = this.context.createBufferQueueSource({ pitchCorrection: false });
    source.connect(this.output);
    // Notifications only wake the producer. Queue duration is derived from the
    // hardware clock, so delayed JS notifications cannot invent extra reserve.
    source.onBufferEnded = () => {
      if (this.source === source) this.wake();
    };
    this.source = source;
  }

  private disposeQueue() {
    if (this.source) {
      this.source.onBufferEnded = null;
      if (this.started) this.source.stop(this.context.currentTime);
      this.source.clearBuffers();
      this.source.disconnect();
      this.source = null;
    }
    this.started = false;
    this.prepared = 0;
    this.end = 0;
  }

  private protectEnd() {
    const now = this.context.currentTime;
    const gain = this.output.gain;
    gain.cancelAndHoldAtTime(now);
    gain.linearRampToValueAtTime(1, Math.max(now, this.fadeInAt) + FADE);
    // This fade executes even if JS stalls or the app is suspended. Appending
    // another buffer cancels it before it begins; normal PCM stays untouched.
    gain.setValueAtTime(1, Math.max(now + FADE, this.end - FADE));
    gain.linearRampToValueAtTime(0, Math.max(now + FADE * 2, this.end));
  }

  private async pump() {
    if (this.pumping || this.closed || this.muted || !this.active) return;
    this.pumping = true;
    const generation = this.generation;
    const core = this.core;
    const valid = () => generation === this.generation && !this.closed && !this.muted;
    try {
      while (valid() && this.active && this.remaining() < this.reserve) {
        this.advance();
        if (!valid()) return;
        const begin = performance.now();
        const buffer = this.context.createBuffer(2, this.frames, this.context.sampleRate);
        const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
        core.render(left, right);
        if (!valid()) return;
        let peak = 0;
        for (let i = 0; i < this.frames; i++) {
          if (!Number.isFinite(left[i]) || !Number.isFinite(right[i]))
            throw new Error("El sintetizador ha producido audio no válido.");
          peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
        }
        this.peak = peak;
        this.lastRenderMs = performance.now() - begin;
        this.renderPeak = Math.max(this.lastRenderMs / 1000, this.renderPeak * 0.98);
        this.reserve = Math.min(MAX_RESERVE, Math.max(this.minimumReserve, this.renderPeak * 3 + this.blockSeconds));
        const now = this.context.currentTime;
        if (this.started && now >= this.end) {
          // Never replay a stale queue after a stall. Keep DSP continuity but
          // prebuffer a fresh source and fade it in before returning to playback.
          this.underruns++;
          this.minimumReserve = Math.min(MAX_RESERVE, this.minimumReserve * 1.5);
          this.reserve = Math.max(this.reserve, this.minimumReserve);
          this.log("UNDERRUN", { lateMs: Math.round((now - this.end) * 1000) });
          this.newQueue();
        }
        if (!this.source) this.newQueue();
        this.source!.enqueueBuffer(buffer);
        this.blocks++;

        if (this.started) {
          this.end += this.blockSeconds;
          this.protectEnd();
        } else {
          this.prepared += this.blockSeconds;
        }
        const status = core.status;
        this.quietSeconds = !status.pending && !status.voices && peak < SILENT
          ? this.quietSeconds + this.blockSeconds : 0;
        if (this.quietSeconds >= this.blockSeconds * 2 && now >= this.holdUntil)
          this.active = false;
        if (!this.started && (this.prepared >= this.reserve || !this.active)) {
          const start = this.context.currentTime + FADE;
          this.fadeInAt = start;
          this.end = start + this.prepared;
          this.output.gain.cancelScheduledValues(this.context.currentTime);
          this.output.gain.setValueAtTime(0, this.context.currentTime);
          this.source!.start(start, 0);
          this.started = true;
          this.protectEnd();
          this.log("START");
        }
        if (performance.now() - this.lastLog >= 2000) this.log("STATUS");
        // Let BLE, transport controls and configuration updates run between blocks.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    } catch (error) {
      if (valid()) {
        this.log("ERROR", { message: error instanceof Error ? error.message : String(error) });
        this.reset();
        this.onError(error);
      }
    } finally {
      this.pumping = false;
      if (!this.closed && !this.muted && this.active)
        this.wake(Math.max(0, (this.remaining() - this.reserve + this.blockSeconds / 2) * 1000));
    }
  }

  silence() {
    this.log("PAUSE");
    this.muted = true;
    this.generation++;
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = null;
    const now = this.context.currentTime;
    this.output.gain.cancelAndHoldAtTime(now);
    this.output.gain.linearRampToValueAtTime(0, now + 0.03);
  }

  reset() {
    this.generation++;
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = null;
    this.active = false;
    this.muted = false;
    this.disposeQueue();
    this.core.close();
    if (!this.closed) this.core = new NativePcmCore(this.context.sampleRate, this.config, this.bank);
    this.holdUntil = 0;
    this.quietSeconds = 0;
    this.output.gain.cancelScheduledValues(this.context.currentTime);
    this.output.gain.setValueAtTime(0, this.context.currentTime);
  }

  close() {
    if (this.closed) return;
    this.log("CLOSE");
    this.closed = true;
    this.reset();
    this.output.disconnect();
  }

  private log(event: string, extra: Record<string, unknown> = {}) {
    this.lastLog = performance.now();
    const data = { event, engine: "native-cpp", platform: Platform.OS,
      rate: this.context.sampleRate, blockMs: Math.round(this.blockSeconds * 1000),
      renderMs: Math.round(this.lastRenderMs * 10) / 10,
      queuedMs: Math.round(this.remaining() * 1000), targetMs: Math.round(this.reserve * 1000),
      peak: Math.round(this.peak * 10000) / 10000,
      ...this.core.status, underruns: this.underruns,
      packetAgeMs: this.lastPacket ? Math.round((this.context.currentTime - this.lastPacket) * 1000) : null,
      ...extra };
    if (event === "ERROR" || event === "UNDERRUN") console.warn("[Plantia PCM]", JSON.stringify(data));
    else console.info("[Plantia PCM]", JSON.stringify(data));
  }

  get diagnostics() {
    return { queuedSeconds: this.remaining(), reserveSeconds: this.reserve,
      renderMs: this.lastRenderMs, underruns: this.underruns, blocks: this.blocks,
      active: this.active, ...this.core.status };
  }
}
