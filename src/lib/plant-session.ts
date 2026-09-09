import { AppState, Platform } from "react-native";
import { isRunningInExpoGo } from "expo";
import { useSyncExternalStore } from "react";
import { GAP_SECONDS } from "./sonora/signal";
import { copyPatch, defaultConfiguration, sanitizeConfiguration, soundSlots, allowedPresets, type Patch, type Configuration } from "./sonora/presets";
import { mood } from "./sonora/moods";
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
  private graphRevision = 0;
  private publishedGraphRevision = 0;
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
      : performance.now() - this.lastPacketAt > GAP_SECONDS * 1000
        ? "gap"
        : "live";
    const hasNewPoints = this.graphRevision !== this.publishedGraphRevision;
    if (!hasNewPoints && signal === this.snapshot.signal) return;
    if (hasNewPoints) this.publishedGraphRevision = this.graphRevision;
    this.update({
      ...(hasNewPoints
        ? {
            points: this.points.slice(),
            lastValue: this.graphLastValue,
          }
        : {}),
      signal,
    });
  };
  private graphBucket = -1;
  private graphSum = 0;
  private graphCount = 0;
  private graphLastSampleAt = 0;
  private graphLastValue: number | null = null;
  private receive = (packet: PlantPacket) => {
    this.audio?.push(packet);
    if (!packet.values) return;
    this.lastPacketAt = performance.now();
    // Only the display is reduced: Sonora still receives every original packet.
    // One averaged point per 50 ms preserves five seconds even during BLE bursts.
    const previous = this.graphLastSampleAt || this.lastPacketAt - 200;
    const span = Math.min(500, Math.max(0, this.lastPacketAt - previous));
    packet.values.forEach((value, i) => {
      const time = this.lastPacketAt - span + span * (i + 1) / packet.values!.length;
      const bucket = Math.floor(time / 50);
      if (bucket !== this.graphBucket) {
        this.graphBucket = bucket;
        this.graphSum = 0;
        this.graphCount = 0;
        this.points.push({ time, value });
      }
      this.graphSum += value;
      this.graphCount++;
      // Replace rather than mutate points already published to React.
      this.points[this.points.length - 1] = {
        time: bucket * 50,
        value: this.graphSum / this.graphCount,
      };
    });
    this.graphLastSampleAt = this.lastPacketAt;
    this.graphLastValue = packet.values[packet.values.length - 1];
    while (this.points.length && this.points[0].time < this.lastPacketAt - 6000)
      this.points.shift();
    this.graphRevision++;
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
    this.graphBucket = -1;
    this.graphSum = 0;
    this.graphCount = 0;
    this.graphLastSampleAt = 0;
    this.graphLastValue = null;
    this.graphRevision++;
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

  private patches = new Map<string, Patch>();
  private moodSettings = new Map<string, Configuration>();
  selectMood = (id: string) => {
    const current = this.snapshot.config;
    if (mood(current.mood).id === id) return;
    this.moodSettings.set(mood(current.mood).id, current);
    this.configure(this.moodSettings.get(id) ?? { ...defaultConfiguration(), mood: id });
  };
  selectPreset = (slotId: string, id: string) => {
    const config = this.snapshot.config;
    const definition = mood(config.mood).slots.find((s) => s.id === slotId);
    if (!definition || !allowedPresets(definition).some((p) => p.id === id)) return;
    const key = `${config.mood ?? 'organic'}:${slotId}:${id}`;
    this.updateSlot(slotId, { patch: this.patches.get(key) ?? copyPatch(id) });
  };
  updateSlot = (id: string, patch: { patch?: Patch; level?: number; motion?: Configuration['synthMotion'] }) => {
    const config = this.snapshot.config;
    this.configure({ ...config, slots: soundSlots(config).map((s) => s.id === id ? { ...s, ...patch } : s) });
  };
  configure = (config: Configuration) => {
    const previous = this.snapshot.config;
    const next = sanitizeConfiguration(config);
    for (const slot of soundSlots(previous))
      this.patches.set(`${previous.mood ?? 'organic'}:${slot.id}:${slot.patch.preset}`, slot.patch);
    this.update({ config: next, error: null });
    void this.audio?.configure(next).catch((error) => {
      if (this.snapshot.config === next) this.update({ config: previous });
      this.error(error);
    });
  };
  togglePlayback = () => {
    void this.audio?.setPlaying(!this.snapshot.playing).catch(this.error);
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

// Subscribe music controls only to settings/playback, never to the chart packets.
export function usePlantSessionValue<T>(select: (snapshot: Snapshot) => T): T {
  return useSyncExternalStore(
    plantSession.subscribe,
    () => select(plantSession.getSnapshot()),
    () => select(plantSession.getSnapshot()),
  );
}
