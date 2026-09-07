import { AppState, Platform } from "react-native";
import { isRunningInExpoGo } from "expo";
import { useSyncExternalStore } from "react";
import { defaultConfiguration, sanitizeConfiguration, type Configuration } from "./sonora/presets";
import type { PlantPacket } from "./plant-packet";
import type { DiscoveredDevice, PlantConnection } from "./plant-connection";
import type { Lane } from "./sonora/composer";
import type { NativeAudio } from "./audio/native-audio";

export type SignalPoint = { time: number; value: number };
type Snapshot = {
  connection: "idle" | "scanning" | "connecting" | "connected" | "disconnecting";
  device: string;
  devices: DiscoveredDevice[];
  playing: boolean;
  config: Configuration;
  points: SignalPoint[];
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
    playing: false,
    config: defaultConfiguration(),
    points: [],
    lastValue: null,
    error: null,
    signal: "waiting",
  };
  private listeners = new Set<() => void>();
  private audio: NativeAudio | null = null;
  private ble: PlantConnection | null = null;
  private generation = 0;
  private points: SignalPoint[] = [];
  private lastPacketAt = 0;
  private graphTimer: ReturnType<typeof setInterval> | null = null;
  private appSubscription: { remove(): void } | null = null;
  private foreground = AppState.currentState === "active";

  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  getSnapshot = () => this.snapshot;
  private update(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
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
      : performance.now() - this.lastPacketAt > 1500
        ? "gap"
        : "live";
    this.update({
      points: this.points.slice(),
      lastValue: this.points.at(-1)?.value ?? null,
      signal,
    });
  };
  private receive = (packet: PlantPacket) => {
    this.audio?.push(packet);
    if (!packet.values) return;
    this.lastPacketAt = performance.now();
    // Draw every raw value, keeping just the last ~12 seconds (600 samples).
    const previous = this.points.at(-1)?.time ?? Math.max(0, packet.elapsed_ms - 200);
    const span = Math.min(500, Math.max(20, packet.elapsed_ms - previous));
    packet.values.forEach((value, i) =>
      this.points.push({ value, time: packet.elapsed_ms - span + (span * (i + 1)) / 10 }),
    );
    this.points = this.points.filter((p) => p.time >= packet.elapsed_ms - 12000).slice(-600);
  };

  private scanTimer: ReturnType<typeof setTimeout> | null = null;

  connect = async () => {
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
    this.points = [];
    this.lastPacketAt = 0;
    this.update({
      connection: "scanning",
      error: null,
      signal: "waiting",
      points: [],
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
        const name = await ble.connectTo(id, this.receive, () => {
          void this.disconnect(
            "Se ha perdido la conexión con la planta. Acerca el sensor y vuelve a conectar.",
          );
        });
        if (generation !== this.generation) return;
        this.watchAppState();
        this.update({ connection: "connected", device: name, devices: [] });
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
        this.graphTimer = setInterval(this.publishGraph, 100);
      }
    });
    if (this.foreground) this.graphTimer = setInterval(this.publishGraph, 100);
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

  configure = (config: Configuration) => {
    const previous = this.snapshot.config;
    const next = sanitizeConfiguration(config);
    this.update({ config: next, error: null });
    void this.audio?.configure(next).catch((error) => {
      if (this.snapshot.config === next) this.update({ config: previous });
      this.error(error);
    });
  };
  togglePlayback = () => {
    void this.audio?.setPlaying(!this.snapshot.playing).catch(this.error);
  };
  preview = (lane: Lane) => this.audio?.preview(lane);
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
