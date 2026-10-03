import {
  GAP_SECONDS,
  type Recording,
} from './sonora/signal.ts';
import {
  noteName,
  type Event,
  type Lane,
} from './sonora/music-types.ts';
import { AudioCore, RELEASE_SECONDS, type Bank } from './sonora/dsp.ts';
import {
  defaultConfiguration,
  sanitizeConfiguration,
  preset,
  type Configuration,
} from './sonora/presets.ts';
import { WaveComposer } from './wave-music/composer';
import { waveMood } from './wave-music/registry';
export const LIVE_DELAY = 0.12;
export type LiveStatus = {
  phase: 'waiting' | 'playing' | 'gap' | 'ended';
  synth?: string;
  instrument?: string;
  note?: string;
  greeting?: boolean;
  voices?: number;
  meters?: Record<Lane, number>;
};
/** The connection clock drives a bounded composer and the same renderer used for saved sessions. */
export class LiveMusicEngine {
  private composer: WaveComposer;
  private audio: AudioCore;
  private elapsed: number;
  private origin: number;
  private lastFrame = -Infinity;
  private stoppedAt = Infinity;
  private lastNote = '';
  private sampleRate: number;
  private config: Configuration;
  private bank: Bank;
  constructor(
    sampleRate: number,
    elapsed = 0,
    config = defaultConfiguration(),
    bank: Bank = {},
  ) {
    config = sanitizeConfiguration(config);
    this.sampleRate = sampleRate;
    this.config = config;
    this.bank = bank;
    this.elapsed = this.origin = elapsed;
    this.audio = new AudioCore(sampleRate, config, bank);
    this.composer = this.createComposer(config);
  }
  private createComposer(config: Configuration) {
    const mood = waveMood(config.profile);
    if (!mood) throw new Error(`Mood de ondas no registrado: ${config.profile}`);
    return new WaveComposer(config, mood, () => {
      if (Number.isFinite(this.stoppedAt)) return;
      this.composer.advance(this.elapsed);
      this.schedule(this.composer.drain());
    }, error => {
      this.finish();
      console.error('[saviasound Waves]', error);
    });
  }
  private schedule(events: Event[]) {
    this.audio.schedule(
      events.map((e) => {
        const time = Math.max(
          this.audio.time,
          e.time - this.origin + LIVE_DELAY,
        );
        if (e.type !== 'note') return { ...e, time };
        if (e.note.lane === 'instrument') this.lastNote = noteName(e.note.midi);
        return {
          ...e,
          time,
          note: {
            ...e.note,
            time,
            sourceTime: e.note.sourceTime - this.origin + LIVE_DELAY,
          },
        };
      }),
    );
  }
  push(packet: Recording['packets'][number]) {
    if (Number.isFinite(this.stoppedAt)) return;
    const time = packet.elapsed_ms / 1000;
    if (Number.isFinite(time) && time > this.elapsed + 0.75) {
      // After OS suspension, discard stale sound rather than replaying a backlog.
      this.elapsed = this.origin = time;
      this.composer.advance(time);
      this.composer.drain();
      this.audio = new AudioCore(this.sampleRate, this.config, this.bank);
    }
    if (this.composer.push(packet, time)) this.lastFrame = time;
    this.schedule(this.composer.drain());
  }
  configure(config: Configuration, bank: Bank = this.bank) {
    config = sanitizeConfiguration(config);
    const replace = config.profile !== this.config.profile;
    if (replace) {
      this.composer.finish(this.elapsed);
      this.schedule(this.composer.drain());
      this.composer = this.createComposer(config);
      this.lastFrame = -Infinity;
    } else this.composer.configure(config, this.elapsed);
    this.config = config;
    this.bank = bank;
    this.audio.configure(config, bank);
    this.schedule(this.composer.drain());
  }
  audition(lane: Lane) {
    this.composer.audition(lane, this.elapsed);
    this.schedule(this.composer.drain());
  }
  finish() {
    if (Number.isFinite(this.stoppedAt)) return;
    this.composer.finish(this.elapsed);
    this.schedule(this.composer.drain());
    this.stoppedAt = this.elapsed;
  }
  render(left: Float32Array, right: Float32Array) {
    if (!Number.isFinite(this.stoppedAt)) {
      this.composer.advance(this.elapsed);
      this.schedule(this.composer.drain());
    }
    this.audio.render(left, right);
    if (Number.isFinite(this.stoppedAt))
      for (let i = 0; i < left.length; i++) {
        const fade = Math.max(
          0,
          Math.min(
            1,
            RELEASE_SECONDS -
              (this.elapsed + i / this.sampleRate - this.stoppedAt),
          ),
        );
        left[i] *= fade;
        right[i] *= fade;
      }
    this.elapsed += left.length / this.sampleRate;
    return (
      !Number.isFinite(this.stoppedAt) ||
      this.elapsed - this.stoppedAt < RELEASE_SECONDS
    );
  }
  get status(): LiveStatus {
    return {
      ...this.audio.status,
      phase: Number.isFinite(this.stoppedAt)
        ? 'ended'
        : this.lastFrame === -Infinity
          ? 'waiting'
          : this.elapsed - this.lastFrame > GAP_SECONDS
            ? 'gap'
            : 'playing',
      synth: preset(this.config.synth.preset).name,
      instrument: preset(this.config.instrument.preset).name,
      note: this.lastNote,
    };
  }
  get diagnostics() {
    return { ...this.audio.status, composition: this.composer.diagnostics };
  }
}
