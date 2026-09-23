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
type Snapshot = {
  connection: "idle" | "scanning" | "connecting" | "connected" | "disconnecting";
  device: string;
  devices: DiscoveredDevice[];
  rememberedDevices: { id: string; name: string; lastConnectedAt: number }[];
  playing: boolean;
  config: Configuration;
  points: SignalPoint[];
  signalTiming: SignalTiming;
  lastValue: number | null;
  error: string | null;
  signal: "waiting" | "live" | "gap";
};

// A session outlives screen renders and AppState changes; there is no recording.
class PlantSession {
  private snapshot: Snapshot = {
    connection: "idle",
    device: "",
    devices: [],
    rememberedDevices: [],
    playing: false,
    config: defaultConfiguration(),
    points: [],
    signalTiming: INITIAL_SIGNAL_TIMING,
    lastValue: null,
    error: null,
    signal: "waiting",
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
      this.update({
        config: sanitizeConfiguration(saved.config ?? this.snapshot.config),
        rememberedDevices: Array.isArray(saved.rememberedDevices) ? saved.rememberedDevices.slice(0, 4) : [],
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
  private receive = (packet: PlantPacket) => {
    this.audio?.push(packet);
    const now = performance.now();
    // Music receives the untouched packet. Only the graph uses reconstructed time.
    if (!this.timeline.push(packet.values ?? [], now, packet.seq)) return;
    this.lastPacketAt = now;
    if (!packet.values) return;
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
    const generation = ++this.generation;
    this.timeline = new SignalTimeline();
    this.graphLastValue = null;
    this.graphRevision++;
    this.lastPacketAt = 0;
    this.update({
      connection: rememberedId ? "connecting" : "scanning",
      device: rememberedId
        ? this.snapshot.rememberedDevices.find(device => device.id === rememberedId)?.name ?? "Tu planta"
        : "",
      error: null,
      signal: "waiting",
      points: [],
      signalTiming: INITIAL_SIGNAL_TIMING,
      lastValue: null,
      devices: [],
    });
    try {
      const [{ NativeAudio }, { PlantConnection }] = await Promise.all([
        import("./audio/native-audio"),
        import("./plant-connection"),
      ]);
      if (generation !== this.generation) return;
      this.audio = new NativeAudio(
        (playing) => this.update({ playing }),
        this.error,
        () => {
          void this.disconnect();
        },
      );
      this.ble = new PlantConnection();
      await this.ble.waitReady();
      if (generation !== this.generation) return;
      await this.audio.start(this.snapshot.config);
      if (generation !== this.generation) return;
      if (rememberedId) {
        await this.connectDevice(rememberedId, true, generation);
        return;
      }
      this.ble.startDiscovery(
        (devices) => {
          if (generation === this.generation && this.snapshot.connection === "scanning")
            this.update({ devices });
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

  private connectDevice = async (id: string, remembered: boolean, generation: number) => {
    const ble = this.ble;
    if (!ble) throw new Error("La conexión Bluetooth no está preparada.");
    const name = remembered
      ? await ble.connectKnown(id, this.receive, message => this.handleLostConnection(generation, message))
      : await ble.connectTo(id, this.receive, message => this.handleLostConnection(generation, message));
    if (generation !== this.generation) return;
    const known = [
      { id, name, lastConnectedAt: Date.now() },
      ...this.snapshot.rememberedDevices.filter(device => device.id !== id),
    ].slice(0, 4);
    this.watchAppState();
    this.update({ connection: "connected", device: name, devices: [], rememberedDevices: known });
    this.persist();
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
    this.update({ connection: "connecting", device: chosen?.name ?? "Tu planta" });
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
    const results = await Promise.allSettled([ble?.close(), audio?.close()]);
    const failure = results.find((r) => r.status === "rejected");
    if (failure?.status === "rejected" && !error) this.error(failure.reason);
    this.update({
      connection: "idle",
      playing: false,
      signal: "waiting",
      device: "",
      devices: [],
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
