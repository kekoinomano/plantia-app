import { PermissionsAndroid, Platform } from "react-native";
import { BleManager, State, type Device, type Subscription } from "react-native-ble-plx";
import { decodePlantPacket, type PlantPacket } from "./plant-packet";

export const PLANT_SERVICE = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
export const PLANT_CHARACTERISTIC = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

export type DiscoveredDevice = {
  id: string;
  name: string;
  rssi: number | null;
  plant: boolean;
};

const isPlant = (device: Device) => (device.serviceUUIDs ?? []).includes(PLANT_SERVICE);

export class PlantConnection {
  private manager = new BleManager();
  private device: Device | null = null;
  private found = new Map<string, Device>();
  private subscriptions: Subscription[] = [];
  private closed = false;
  private scanning = false;
  private abortWait: (() => void) | null = null;

  private authorized = false;
  async prepare() {
    if (this.authorized) return;
    if (Platform.OS !== "android") return;
    const required =
      Number(Platform.Version) >= 31
        ? [
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          ]
        : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
    const result = await PermissionsAndroid.requestMultiple(required);
    if (required.some((p) => result[p] !== PermissionsAndroid.RESULTS.GRANTED)) {
      throw new Error("Permite el acceso a Bluetooth para conectar tu planta.");
    }
    this.authorized = true;
  }

  async waitReady() {
    await this.prepare();
    if (this.closed) throw new Error("Conexión cancelada.");
    await new Promise<void>((resolve, reject) => {
      let subscription: Subscription | undefined;
      const finish = (error?: Error) => {
        clearTimeout(timer);
        subscription?.remove();
        this.abortWait = null;
        error ? reject(error) : resolve();
      };
      const timer = setTimeout(
        () => finish(new Error("Activa Bluetooth y vuelve a conectar.")),
        12000,
      );
      this.abortWait = () => finish(new Error("Conexión cancelada."));
      subscription = this.manager.onStateChange((state) => {
        if (state === State.PoweredOn) finish();
        else if ([State.Unsupported, State.Unauthorized, State.PoweredOff].includes(state)) {
          finish(
            new Error(
              state === State.Unauthorized
                ? "Permite Bluetooth en los ajustes del teléfono."
                : "Activa Bluetooth para conectar tu planta.",
            ),
          );
        }
      }, true);
    });
    if (this.closed) throw new Error("Conexión cancelada.");
  }

  private list(): DiscoveredDevice[] {
    return [...this.found.values()]
      .filter((device) => isPlant(device) || Boolean(device.name || device.localName))
      .map((device) => ({
        id: device.id,
        name: device.name || device.localName || "Sensor de planta",
        rssi: device.rssi ?? null,
        plant: isPlant(device),
      }))
      .sort(
        (a, b) =>
          Number(b.plant) - Number(a.plant) || (b.rssi ?? -999) - (a.rssi ?? -999),
      );
  }

  startDiscovery(
    onDevices: (devices: DiscoveredDevice[]) => void,
    onError: (message: string) => void,
  ) {
    if (this.closed || this.scanning) return;
    this.scanning = true;
    this.found.clear();
    this.manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (this.closed || !this.scanning) return;
      if (error) {
        this.stopDiscovery();
        onError(error.message || "No se pudo buscar dispositivos Bluetooth.");
        return;
      }
      if (!device || this.found.has(device.id)) return;
      this.found.set(device.id, device);
      onDevices(this.list());
    });
  }

  stopDiscovery() {
    if (!this.scanning) return;
    this.scanning = false;
    this.manager.stopDeviceScan();
  }

  async connectTo(
    id: string,
    onPacket: (packet: PlantPacket) => void,
    onDisconnect: () => void,
  ) {
    const target = this.found.get(id) ?? null;
    this.stopDiscovery();
    if (this.closed) throw new Error("Conexión cancelada.");
    if (!target) throw new Error("Ese sensor dejó de estar disponible. Vuelve a buscarlo.");
    const connected = await target.connect({ timeout: 12000, requestMTU: 247 });
    this.device = connected;
    if (this.closed) {
      await connected.cancelConnection();
      throw new Error("Conexión cancelada.");
    }
    await connected.discoverAllServicesAndCharacteristics();
    if (this.closed) throw new Error("Conexión cancelada.");
    let seq = 0;
    const origin = performance.now();
    this.subscriptions.push(
      connected.onDisconnected(() => {
        if (!this.closed) onDisconnect();
      }),
    );
    this.subscriptions.push(
      connected.monitorCharacteristicForService(
        PLANT_SERVICE,
        PLANT_CHARACTERISTIC,
        (error, value) => {
          if (this.closed) return;
          if (error) {
            onDisconnect();
            return;
          }
          if (value?.value)
            onPacket(decodePlantPacket(value.value, seq++, performance.now() - origin));
        },
      ),
    );
    return connected.name ?? connected.localName ?? "Tu planta";
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.abortWait?.();
    this.stopDiscovery();
    this.found.clear();
    this.subscriptions.forEach((s) => s.remove());
    this.subscriptions = [];
    if (this.device) await this.device.cancelConnection().catch(() => {});
    await this.manager.destroy();
  }
}
