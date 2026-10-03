import { PermissionsAndroid, Platform } from "react-native";
import { BleManager, State, type Device, type Subscription } from "react-native-ble-plx";
import { decodePlantPacket, type PlantPacket } from "./plant-packet";

// Deben coincidir con SERVICE_UUID y DATA_UUID del firmware hardware/arduino/v2.
export const PLANT_SERVICE = "df7167d3-4595-4d3e-b28d-f20ae4c87cdc";
export const PLANT_CHARACTERISTIC = "05cdaa8c-62b1-459e-a07f-1e4167b443c5";

export type DiscoveredDevice = {
  id: string;
  name: string;
  rssi: number | null;
  plant: boolean;
};

// Solo aceptamos el servicio anunciado por nuestro firmware, independientemente del nombre.
const isPlant = (device: Device) =>
  (device.serviceUUIDs ?? []).some((uuid) => uuid.toLowerCase() === PLANT_SERVICE);

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
      .filter(isPlant)
      .map((device) => ({
        id: device.id,
        name: "Dispositivo",
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
    onDevices([]);
    // Bluetooth filtra por el UUID del servicio; además lo comprobamos al recibir cada resultado.
    this.manager.startDeviceScan([PLANT_SERVICE], { allowDuplicates: false }, (error, device) => {
      if (this.closed || !this.scanning) return;
      if (error) {
        this.stopDiscovery();
        onError(error.message || "No se pudo buscar dispositivos Bluetooth.");
        return;
      }
      if (!device || !isPlant(device) || this.found.has(device.id)) return;
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
    onDisconnect: (message?: string) => void,
  ) {
    const target = this.found.get(id) ?? null;
    this.stopDiscovery();
    if (this.closed) throw new Error("Conexión cancelada.");
    if (!target) throw new Error("Ese sensor dejó de estar disponible. Vuelve a buscarlo.");
    const connected = await target.connect({
      timeout: 12000,
      requestMTU: 247,
      // El mismo ESP32 ahora tiene otros UUID. Android puede conservar el GATT antiguo.
      ...(Platform.OS === "android" ? { refreshGatt: "OnConnected" as const } : {}),
    });
    return this.finishConnection(connected, onPacket, onDisconnect);
  }

  async connectKnown(
    id: string,
    onPacket: (packet: PlantPacket) => void,
    onDisconnect: (message?: string) => void,
  ) {
    this.stopDiscovery();
    if (this.closed) throw new Error("Conexión cancelada.");
    const connected = await this.manager.connectToDevice(id, {
      timeout: 12000,
      requestMTU: 247,
      ...(Platform.OS === "android" ? { refreshGatt: "OnConnected" as const } : {}),
    });
    return this.finishConnection(connected, onPacket, onDisconnect);
  }

  private async finishConnection(
    connected: Device,
    onPacket: (packet: PlantPacket) => void,
    onDisconnect: (message?: string) => void,
  ) {
    this.device = connected;
    if (this.closed) {
      await connected.cancelConnection();
      throw new Error("Conexión cancelada.");
    }
    console.info("[saviasound BLE] Conectado; descubriendo servicios", connected.id);
    this.subscriptions.push(
      connected.onDisconnected((error) => {
        console.info("[saviasound BLE] Desconectado", error);
        if (!this.closed) onDisconnect();
      }),
    );
    await connected.discoverAllServicesAndCharacteristics();
    if (this.closed) throw new Error("Conexión cancelada.");
    const services = await connected.services();
    if (!services.some((service) => service.uuid.toLowerCase() === PLANT_SERVICE)) {
      throw new Error("El sensor no ofrece el servicio compatible con saviasound. Actualiza el firmware y vuelve a conectar.");
    }
    const characteristics = await connected.characteristicsForService(PLANT_SERVICE);
    if (!characteristics.some((characteristic) =>
      characteristic.uuid.toLowerCase() === PLANT_CHARACTERISTIC && characteristic.isNotifiable)) {
      throw new Error("El sensor no ofrece el canal de datos compatible con saviasound. Actualiza el firmware y vuelve a conectar.");
    }
    if (this.closed) throw new Error("Conexión cancelada.");
    let seq = 0;
    const origin = performance.now();
    console.info("[saviasound BLE] Activando notificaciones", PLANT_CHARACTERISTIC);
    this.subscriptions.push(
      connected.monitorCharacteristicForService(
        PLANT_SERVICE,
        PLANT_CHARACTERISTIC,
        (error, value) => {
          if (this.closed) return;
          if (error) {
            console.warn("[saviasound BLE] Error al recibir notificaciones", error);
            onDisconnect(`No se pudieron recibir los datos del sensor: ${error.reason || error.message} (BLE ${error.errorCode}).`);
            return;
          }
          if (value?.value)
            onPacket(decodePlantPacket(value.value, seq++, performance.now() - origin));
        },
      ),
    );
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
