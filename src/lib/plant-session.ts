import { AppState, Platform } from "react-native";
import { isRunningInExpoGo } from "expo";
import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GAP_SECONDS } from "./sonora/signal";
import { defaultConfiguration, sanitizeConfiguration, type Configuration } from "./sonora/presets";
import type { ProfileId } from "./sonora/focus";
import type { PlantPacket } from "./plant-packet";
import type { DiscoveredDevice, PlantConnection } from "./plant-connection";
import type { Lane } from "./sonora/music-types";
import type { NativeAudio } from "./audio/native-audio";
import { SignalTimeline, INITIAL_SIGNAL_TIMING, type ChartPoint, type SignalTiming } from "./signal-chart";

export type SignalPoint = ChartPoint;
type Reading = { at: number; mean: number; amplitude: number; change: number };
type SensorHistory = { mean: number; amplitude: number; change: number; count: number; meanM2: number };
export type PlantIndicators = { speed: number | null; change: number | null; amplitude: number | null; stability: number | null };
const EMPTY_INDICATORS: PlantIndicators = { speed: null, change: null, amplitude: null, stability: null };
const clamp = (value: number) => Math.max(0, Math.min(1, value));
type Snapshot = {
  connection: "idle" | "scanning" | "connecting" | "connected" | "disconnecting";
  device: string;
  devices: DiscoveredDevice[];
  rememberedDevices: { id: string; name: string; lastConnectedAt: number }[];
  playing: boolean;
  audioReady: boolean;
  config: Configuration;
  points: SignalPoint[];
  signalTiming: SignalTiming;
  lastValue: number | null;
  error: string | null;
  signal: "waiting" | "live" | "gap";
  indicators: PlantIndicators;
};

// A session outlives screen renders and AppState changes; there is no recording.
class PlantSession {
  private deviceNames = new Map<string, string>();
  private snapshot: Snapshot = {
    connection: "idle",
    device: "",
    devices: [],
    rememberedDevices: [],
    playing: false,
    audioReady: false,
    config: defaultConfiguration(),
    points: [],
    signalTiming: INITIAL_SIGNAL_TIMING,
    lastValue: null,
    error: null,
    signal: "waiting",
    indicators: EMPTY_INDICATORS,
  };
  private listeners = new Set<() => void>();
  private controls = this.snapshot;
  private graphListeners = new Set<() => void>();
  private controlListeners = new Set<() => void>();
  subscribeGraph = (callback: () => void) => {
    this.graphListeners.add(callback);
    return () => { this.graphListeners.delete(callback); };
  };
  subscribeControls = (callback: () => void) => {
    this.controlListeners.add(callback);
    return () => { this.controlListeners.delete(callback); };
  };
  private audio: NativeAudio | null = null;
  private ble: PlantConnection | null = null;
  private generation = 0;
  private timeline = new SignalTimeline();
  private graphRevision = 0;
  private publishedGraphRevision = 0;
  private lastPacketAt = 0;
  private graphTimer: ReturnType<typeof setInterval> | null = null;
  private appSubscription: { remove(): void } | null = null;
  private foreground = AppState.currentState === "active";
  private static readonly STORAGE_KEY = "muromura.session.v2";
  private moodSettings: Partial<Record<ProfileId, { scale: string; tuning: number }>> = {};
  private sessionHistory: SensorHistory = { mean: 0, amplitude: 0, change: 0, count: 0, meanM2: 0 };
  private connectedId: string | null = null;
  private readings: Reading[] = [];
  private lastIndicatorsAt = 0;
  private previousPacketMean: number | null = null;

  constructor() {
    void this.hydrate();
  }

  private hydrate = async () => {
    try {
      const saved = JSON.parse((await AsyncStorage.getItem(PlantSession.STORAGE_KEY)) ?? "null") as {
        config?: Configuration;
        rememberedDevices?: Snapshot["rememberedDevices"];
        moodSettings?: Partial<Record<ProfileId, { scale: string; tuning: number }>>;
      } | null;
      if (!saved) return;
      this.moodSettings = saved.moodSettings ?? {};
      const storedDevices = Array.isArray(saved.rememberedDevices)
        ? saved.rememberedDevices.slice(0, 4).filter(device => device && typeof device.id === "string")
        : [];
      const usedNames = new Set(storedDevices
        .map(device => device.name)
        .filter((name): name is string => typeof name === "string" && /^Dispositivo(?: [1-9]\d*)?$/.test(name)));
      const rememberedDevices = storedDevices.map(device => {
        if (typeof device.name === "string" && usedNames.has(device.name) &&
            storedDevices.filter(other => other.name === device.name).length === 1) return device;
        let number = 0;
        while (usedNames.has(number === 0 ? "Dispositivo" : `Dispositivo ${number}`)) number++;
        const name = number === 0 ? "Dispositivo" : `Dispositivo ${number}`;
        usedNames.add(name);
        return { ...device, name };
      });
      rememberedDevices.forEach(device => this.deviceNames.set(device.id, device.name));
      this.update({
        config: sanitizeConfiguration(saved.config ?? this.snapshot.config),
        rememberedDevices,
      });
    } catch {
      // Corrupt or unavailable local preferences should never block listening.
    }
  };

  private persist = () => {
    void AsyncStorage.setItem(PlantSession.STORAGE_KEY, JSON.stringify({
      config: this.snapshot.config,
      rememberedDevices: this.snapshot.rememberedDevices,
      moodSettings: this.moodSettings,
    })).catch(() => {});
  };

  private nameForDevice = (id: string) => {
    const existing = this.deviceNames.get(id);
    if (existing) return existing;
    const used = new Set(this.deviceNames.values());
    let number = 0;
    while (used.has(number === 0 ? "Dispositivo" : `Dispositivo ${number}`)) number++;
    const name = number === 0 ? "Dispositivo" : `Dispositivo ${number}`;
    this.deviceNames.set(id, name);
    return name;
  };

  forgetDevice = (id: string) => {
    this.deviceNames.delete(id);
    this.update({ rememberedDevices: this.snapshot.rememberedDevices.filter(device => device.id !== id) });
    this.persist();
  };

  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  getSnapshot = () => this.snapshot;
  getControls = () => this.controls;
  private update(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    if (Object.keys(patch).some(key => !['points', 'signalTiming', 'lastValue', 'signal'].includes(key))) {
      this.controls = this.snapshot;
      this.controlListeners.forEach(listener => listener());
    }
    if ('points' in patch || 'signalTiming' in patch || 'signal' in patch)
      this.graphListeners.forEach(listener => listener());
    this.listeners.forEach((listener) => listener());
  }
  private error = (error: unknown) => {
    this.update({
      error: error instanceof Error ? error.message : "No se pudo iniciar la sesión.",
    });
  };
  private publishGraph = () => {
    if (!this.foreground) return;
    const signal = !this.lastPacketAt
      ? "waiting"
      : performance.now() - this.lastPacketAt > Math.max(GAP_SECONDS * 1000, this.timeline.timing.gapMs)
        ? "gap"
        : "live";
    const hasNewPoints = this.graphRevision !== this.publishedGraphRevision;
    if (!hasNewPoints && signal === this.snapshot.signal) return;
    if (hasNewPoints) this.publishedGraphRevision = this.graphRevision;
    this.update({
      ...(hasNewPoints
        ? {
            points: this.timeline.snapshot,
            signalTiming: this.timeline.timing,
            lastValue: this.graphLastValue,
          }
        : {}),
      signal,
    });
  };
  private graphLastValue: number | null = null;
  private updateIndicators = (now: number) => {
    const history = this.sessionHistory;
    const recent = this.readings.filter(reading => now - reading.at <= 5000);
    const long = this.readings.filter(reading => now - reading.at <= 30000);
    const enoughRecent = recent.length > 1 && recent.at(-1)!.at - recent[0].at >= 3000;
    const enoughLong = long.length > 1 && long.at(-1)!.at - long[0].at >= 20000;
    const recentMean = enoughRecent ? recent.reduce((sum, reading) => sum + reading.mean, 0) / recent.length : 0;
    const recentAmplitude = enoughRecent ? recent.reduce((sum, reading) => sum + reading.amplitude, 0) / recent.length : 0;
    const recentChange = enoughRecent ? recent.reduce((sum, reading) => sum + reading.change, 0) / recent.length : 0;
    const longMean = enoughLong ? long.reduce((sum, reading) => sum + reading.mean, 0) / long.length : 0;
    const longVariation = enoughLong
      ? Math.sqrt(long.reduce((sum, reading) => sum + (reading.mean - longMean) ** 2, 0) / long.length) / longMean
      : 0;
    const usualVariation = history.count > 1
      ? Math.sqrt(history.meanM2 / (history.count - 1)) / history.mean : 0;
    const speedRange = Math.max(history.mean * .0002, Math.sqrt(history.meanM2 / Math.max(1, history.count - 1)) * .8);
    const targets: PlantIndicators = {
      speed: enoughRecent && history.count >= 5 ? clamp(.5 + (history.mean - recentMean) / speedRange * .3) : null,
      change: enoughRecent && history.count >= 5
        ? recentChange === 0 ? 0 : clamp(.5 + Math.log((recentChange + 1) / (history.change + 1)) / Math.log(3) * .5) : null,
      amplitude: enoughRecent && history.count >= 5
        ? recentAmplitude === 0 ? 0 : clamp(.5 + Math.log((recentAmplitude + 1) / (history.amplitude + 1)) / Math.log(3) * .5) : null,
      stability: enoughLong ? 1 - clamp(longVariation / Math.max(usualVariation * 2, .001)) : null,
    };
    const previous = this.snapshot.indicators;
    this.update({ indicators: {
      speed: targets.speed === null ? null : previous.speed === null ? targets.speed : previous.speed + (targets.speed - previous.speed) * .4,
      change: targets.change === null ? null : previous.change === null ? targets.change : previous.change + (targets.change - previous.change) * .4,
      amplitude: targets.amplitude === null ? null : previous.amplitude === null ? targets.amplitude : previous.amplitude + (targets.amplitude - previous.amplitude) * .4,
      stability: targets.stability === null ? null : previous.stability === null ? targets.stability : previous.stability + (targets.stability - previous.stability) * .4,
    } });
  };
  private receive = (packet: PlantPacket) => {
    this.audio?.push(packet);
    const now = performance.now();
    // Music receives the untouched packet. Only the graph uses reconstructed time.
    if (!this.timeline.push(packet.values ?? [], now, packet.seq)) return;
    this.lastPacketAt = now;
    if (!packet.values) return;
    if (this.connectedId) {
      const mean = packet.values.reduce((sum, value) => sum + value, 0) / packet.values.length;
      if (mean > 0) {
        const amplitude = Math.max(...packet.values) - Math.min(...packet.values);
        const change = this.previousPacketMean === null ? 0 : Math.abs(mean - this.previousPacketMean);
        this.previousPacketMean = mean;
        this.readings.push({ at: now, mean, amplitude, change });
        while (this.readings.length && now - this.readings[0].at > 30000) this.readings.shift();
        const history = this.sessionHistory;
        const count = history.count + 1;
        const nextMean = history.mean + (mean - history.mean) / count;
        this.sessionHistory = {
          mean: nextMean,
          amplitude: history.amplitude + (amplitude - history.amplitude) / count,
          change: count > 1 ? history.change + (change - history.change) / (count - 1) : 0,
          count,
          meanM2: history.meanM2 + (mean - history.mean) * (mean - nextMean),
        };
        if (now - this.lastIndicatorsAt >= 2000) {
          this.lastIndicatorsAt = now;
          this.updateIndicators(now);
        }
      }
    }
    this.graphLastValue = packet.values[packet.values.length - 1];
    this.graphRevision++;
  };

  private scanTimer: ReturnType<typeof setTimeout> | null = null;

  connect = async (rememberedId?: string) => {
    if (this.snapshot.connection !== "idle") return;
    if (Platform.OS === "web") {
      this.error(new Error("Abre la app de Plantia en iOS o Android para conectar el sensor."));
      return;
    }
    if (isRunningInExpoGo()) {
      this.error(new Error("Estás en Expo Go, que no incluye el audio ni Bluetooth de Plantia. Abre la app Plantia instalada; puedes hacerlo con npm run ios:open."));
      return;
    }
    if (!rememberedId) this.deviceNames = new Map(this.snapshot.rememberedDevices.map(device => [device.id, device.name]));
    const generation = ++this.generation;
    this.timeline = new SignalTimeline();
    this.connectedId = null;
    this.readings = [];
    this.lastIndicatorsAt = 0;
    this.previousPacketMean = null;
    this.sessionHistory = { mean: 0, amplitude: 0, change: 0, count: 0, meanM2: 0 };
    this.graphLastValue = null;
    this.graphRevision++;
    this.lastPacketAt = 0;
    this.update({
      connection: rememberedId ? "connecting" : "scanning",
      device: rememberedId
        ? this.nameForDevice(rememberedId)
        : "",
      error: null,
      signal: "waiting",
      points: [],
      signalTiming: INITIAL_SIGNAL_TIMING,
      lastValue: null,
      indicators: EMPTY_INDICATORS,
      audioReady: false,
      devices: [],
    });
    try {
      const { PlantConnection } = await import("./plant-connection");
      if (generation !== this.generation) return;
      this.ble = new PlantConnection();
      await this.ble.waitReady();
      if (generation !== this.generation) return;
      if (rememberedId) {
        await this.connectDevice(rememberedId, true, generation);
        return;
      }
      this.ble.startDiscovery(
        (devices) => {
          if (generation === this.generation && this.snapshot.connection === "scanning")
            this.update({ devices: devices.map(device => ({ ...device, name: this.nameForDevice(device.id) })) });
        },
        (message) => {
          if (generation === this.generation) void this.disconnect(message);
        },
      );
      this.scanTimer = setTimeout(() => {
        this.scanTimer = null;
        if (generation !== this.generation) return;
        if (this.snapshot.connection === "scanning" && this.snapshot.devices.length === 0)
          void this.disconnect(
            "No encuentro ninguna planta. Enciende el sensor, acércalo al teléfono e inténtalo otra vez.",
          );
      }, 25000);
    } catch (error) {
      if (generation !== this.generation) return;
      await this.disconnect(
        error instanceof Error ? error.message : "No se pudo conectar con la planta.",
      );
    }
  };

  connectRemembered = (id: string) => this.connect(id);

  private startAudio = async (generation: number) => {
    let audio: NativeAudio | null = null;
    try {
      const { NativeAudio } = await import("./audio/native-audio");
      if (generation !== this.generation || this.snapshot.connection !== "connected") return;
      audio = new NativeAudio(
        playing => { if (generation === this.generation) this.update({ playing }); },
        error => { if (generation === this.generation) this.error(error); },
        () => { if (generation === this.generation) void this.disconnect(); },
      );
      this.audio = audio;
      await audio.start(this.snapshot.config);
      if (generation !== this.generation || this.snapshot.connection !== "connected") {
        if (this.audio === audio) this.audio = null;
        await audio.close();
      } else {
        this.update({ audioReady: true });
      }
    } catch (error) {
      if (this.audio === audio) this.audio = null;
      await audio?.close().catch(() => {});
      if (generation === this.generation && this.snapshot.connection === "connected") this.error(error);
    }
  };

  private connectDevice = async (id: string, remembered: boolean, generation: number) => {
    const ble = this.ble;
    if (!ble) throw new Error("La conexión Bluetooth no está preparada.");
    this.connectedId = id;
    remembered
      ? await ble.connectKnown(id, this.receive, message => this.handleLostConnection(generation, message))
      : await ble.connectTo(id, this.receive, message => this.handleLostConnection(generation, message));
    if (generation !== this.generation) return;
    const name = this.nameForDevice(id);
    const known = [
      { id, name, lastConnectedAt: Date.now() },
      ...this.snapshot.rememberedDevices.filter(device => device.id !== id),
    ].slice(0, 4);
    this.watchAppState();
    this.update({ connection: "connected", device: name, devices: [], rememberedDevices: known });
    this.persist();
    void this.startAudio(generation);
  };

  private handleLostConnection = (generation: number, message?: string) => {
    if (generation !== this.generation) return;
    void this.disconnect(message ?? "Se ha perdido la conexión con la planta. Acerca el sensor y vuelve a conectar.");
  };

  selectDevice = (id: string) => {
    const ble = this.ble;
    if (!ble || this.snapshot.connection !== "scanning") return;
    const generation = this.generation;
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    const chosen = this.snapshot.devices.find((device) => device.id === id);
    this.update({ connection: "connecting", device: chosen?.name ?? this.nameForDevice(id) });
    void (async () => {
      try {
        await this.connectDevice(id, false, generation);
      } catch (error) {
        if (generation !== this.generation) return;
        await this.disconnect(
          error instanceof Error
            ? error.message
            : "No se pudo conectar con la planta. Inténtalo otra vez.",
        );
      }
    })();
  };

  private watchAppState = () => {
    this.foreground = AppState.currentState === "active";
    this.appSubscription = AppState.addEventListener("change", (state) => {
      this.foreground = state === "active";
      if (this.graphTimer) clearInterval(this.graphTimer);
      this.graphTimer = null;
      if (this.foreground) {
        this.publishGraph();
        this.graphTimer = setInterval(this.publishGraph, 125);
      }
    });
    if (this.foreground) this.graphTimer = setInterval(this.publishGraph, 125);
  };

  disconnect = async (error: string | null = null) => {
    if (this.snapshot.connection === "disconnecting") return;
    ++this.generation;
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    this.update({ connection: "disconnecting", error });
    if (this.graphTimer) clearInterval(this.graphTimer);
    this.graphTimer = null;
    this.appSubscription?.remove();
    this.appSubscription = null;
    const audio = this.audio,
      ble = this.ble;
    this.audio = null;
    this.ble = null;
    this.connectedId = null;
    this.readings = [];
    const results = await Promise.allSettled([ble?.close(), audio?.close()]);
    const failure = results.find((r) => r.status === "rejected");
    if (failure?.status === "rejected" && !error) this.error(failure.reason);
    this.update({
      connection: "idle",
      playing: false,
      audioReady: false,
      signal: "waiting",
      device: "",
      devices: [],
      indicators: EMPTY_INDICATORS,
    });
  };

  setVolume = (volume: number) => this.configure({ ...this.snapshot.config, volume });
  selectProfile = (profile: Configuration['profile']) => {
    const saved = this.moodSettings[profile];
    this.configure({
      ...this.snapshot.config,
      profile,
      scale: saved?.scale ?? "",
      tuning: saved?.tuning ?? Number.NaN,
    });
  };
  configure = (config: Configuration) => {
    const previous = this.snapshot.config;
    const next = sanitizeConfiguration(config);
    this.moodSettings[next.profile] = { scale: next.scale, tuning: next.tuning };
    this.update({ config: next, error: null });
    this.persist();
    void this.audio?.configure(next).catch((error) => {
      if (this.snapshot.config === next) this.update({ config: previous });
      this.error(error);
    });
  };
  togglePlayback = () => {
    void this.audio?.setMuted(this.snapshot.playing).catch(this.error);
  };
  preview = (slot: string) => this.audio?.preview(slot);
  clearError = () => this.update({ error: null });
}

export const plantSession = new PlantSession();
export function usePlantSession() {
  return useSyncExternalStore(
    plantSession.subscribe,
    plantSession.getSnapshot,
    plantSession.getSnapshot,
  );
}

export function usePlantControls() {
  return useSyncExternalStore(plantSession.subscribeControls, plantSession.getControls, plantSession.getControls);
}

// Subscribe music controls only to settings/playback, never to the chart packets.
export function usePlantSessionValue<T>(select: (snapshot: Snapshot) => T): T {
  return useSyncExternalStore(
    plantSession.subscribe,
    () => select(plantSession.getSnapshot()),
    () => select(plantSession.getSnapshot()),
  );
}
