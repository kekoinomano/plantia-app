#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>

// Ajustes fijos: pin del sensor y número de intervalos que enviamos juntos.
// constexpr significa constante; uint8_t es un entero sin signo de 8 bits.
constexpr uint8_t INPUT_PIN = 4;
constexpr uint8_t SAMPLE_COUNT = 10;
// El móvil busca SERVICE_UUID y recibe los datos a través de DATA_UUID.
// Estos dos valores también están en src/lib/plant-connection.ts.
constexpr char SERVICE_UUID[] = "df7167d3-4595-4d3e-b28d-f20ae4c87cdc";
constexpr char DATA_UUID[] = "05cdaa8c-62b1-459e-a07f-1e4167b443c5";

// Objetos de Bluetooth: servidor, canal de datos y permiso del móvil para recibirlos.
// El * indica un puntero: la librería crea el objeto y guardamos su dirección.
BLEServer* server;
BLECharacteristic* data;
BLE2902* subscription;
// Evita que la interrupción, loop() y Bluetooth modifiquen las muestras a la vez.
portMUX_TYPE sampleMux = portMUX_INITIALIZER_UNLOCKED;
// volatile avisa al compilador de que estas variables cambian fuera de loop().
// No sustituye al bloqueo sampleMux. uint32_t es un entero sin signo de 32 bits.
volatile bool connected = false;
volatile bool captureEnabled = false;
volatile bool hasPreviousTime = false;
// Cambia también al activar/desactivar notificaciones para descartar bloques anteriores.
volatile uint32_t session = 0;
volatile uint32_t previousTime = 0;
volatile uint32_t samples[SAMPLE_COUNT];
volatile uint8_t sampleCount = 0;

// Llamar siempre dentro del bloqueo sampleMux.
// Basta con reiniciar el contador: las 10 posiciones se sobrescriben antes de enviar.
void resetSamples() {
  sampleCount = 0;
  previousTime = 0;
  hasPreviousTime = false;
  ++session;
}

// Se ejecuta automáticamente cuando GPIO 4 pasa de LOW a HIGH.
// ARDUINO_ISR_ATTR es la marca que usa ESP32 para las funciones de interrupción.
// Aquí solo medimos y guardamos: enviar por Bluetooth se hace después, en loop().
void ARDUINO_ISR_ATTR onRise() {
  portENTER_CRITICAL_ISR(&sampleMux);
  if (captureEnabled) {
    const uint32_t now = micros();
    // La primera subida solo fija el inicio. La segunda guarda el primer intervalo real.
    if (hasPreviousTime && sampleCount < SAMPLE_COUNT) {
      samples[sampleCount] = now - previousTime;
      sampleCount++;
    }
    // Aunque el array esté lleno, recordamos el último flanco real.
    previousTime = now;
    hasPreviousTime = true;
  }
  portEXIT_CRITICAL_ISR(&sampleMux);
}

class SubscriptionCallbacks : public BLEDescriptorCallbacks {
  // Es la suscripción estándar de BLE, no un comando propio de la app.
  // Lo hacemos aquí para no perder una desactivación/activación rápida entre dos loop().
  void onWrite(BLEDescriptor*) override {
    const bool enabled = subscription->getNotifications();
    portENTER_CRITICAL(&sampleMux);
    const bool shouldCapture = connected && enabled;
    if (captureEnabled != shouldCapture) {
      captureEnabled = shouldCapture;
      resetSamples();
    }
    portEXIT_CRITICAL(&sampleMux);
  }
};

class ConnectionCallbacks : public BLEServerCallbacks {
  // La librería llama a este método cuando se conecta el móvil.
  void onConnect(BLEServer*) override {
    // Cada conexión debe activar sus propias notificaciones.
    subscription->setNotifications(false);
    portENTER_CRITICAL(&sampleMux);
    captureEnabled = false;
    resetSamples();
    connected = true;
    portEXIT_CRITICAL(&sampleMux);
    Serial.println("[BLE] Movil conectado. Esperando que active las notificaciones.");
  }

  // Dejamos de recoger datos y descartamos cualquier bloque a medio llenar.
  void onDisconnect(BLEServer* device) override {
    portENTER_CRITICAL(&sampleMux);
    connected = false;
    captureEnabled = false;
    resetSamples();
    portEXIT_CRITICAL(&sampleMux);
    Serial.println("[BLE] Movil desconectado. Muestras pendientes descartadas.");
    device->startAdvertising(); // Vuelve a aparecer en las búsquedas del móvil.
    Serial.println("[BLE] Disponible para conectar: anunciando Plantia.");
  }

#if defined(CONFIG_BLUEDROID_ENABLED)
  // Esta variante nos permite ver también el motivo numérico que da ESP32.
  void onDisconnect(BLEServer*, esp_ble_gatts_cb_param_t* event) override {
    Serial.printf("[BLE] Motivo de desconexion: 0x%02x\n", event->disconnect.reason);
  }

  void onMtuChanged(BLEServer*, esp_ble_gatts_cb_param_t* event) override {
    Serial.printf("[BLE] MTU acordado con el movil: %u\n", event->mtu.mtu);
  }
#endif
};

void setup() {
  Serial.begin(115200);
  Serial.println("\n[Plantia] Arrancando v2. Monitor serie: 115200 baudios.");
  Serial.printf("[BLE] UUID servicio: %s\n", SERVICE_UUID);
  Serial.printf("[BLE] UUID datos: %s\n", DATA_UUID);
  // INPUT_PULLUP activa la resistencia interna que mantiene el pin en HIGH en reposo.
  pinMode(INPUT_PIN, INPUT_PULLUP);
  BLEDevice::init("Plantia");
  // Tamaño máximo de paquete que ofrecemos. El móvil también debe negociarlo.
  BLEDevice::setMTU(247);
  server = BLEDevice::createServer();
  server->setCallbacks(new ConnectionCallbacks());
  BLEService* service = server->createService(SERVICE_UUID);
  // NOTIFY permite enviar; no añadimos WRITE porque no recibimos comandos.
  data = service->createCharacteristic(DATA_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  // Descriptor estándar de BLE: el móvil lo usa para activar las notificaciones.
  subscription = new BLE2902();
  subscription->setCallbacks(new SubscriptionCallbacks());
  data->addDescriptor(subscription);
  service->start();
  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID); // Este es el código que filtra la app.
  // Permite incluir información adicional, como el nombre, al responder al escaneo.
  advertising->setScanResponse(true);
  attachInterrupt(digitalPinToInterrupt(INPUT_PIN), onRise, RISING);
  advertising->start();
  Serial.println("[BLE] Disponible para conectar: anunciando Plantia.");
}

void loop() {
  // Logs solo cuando cambia el estado, nunca por cada flanco del sensor.
  static uint32_t loggedSession = 0;
  static bool notificationsEnabled = false;
  static bool firstPacketSent = false;
  static bool mtuWarning = false;
  // Copia local de los 10 valores: construimos el mensaje fuera del bloqueo.
  uint32_t batch[SAMPLE_COUNT];
  uint32_t batchSession;
  portENTER_CRITICAL(&sampleMux);
  const bool canNotify = captureEnabled;
  const bool ready = canNotify && sampleCount == SAMPLE_COUNT;
  batchSession = session;
  if (ready) {
    for (uint8_t i = 0; i < SAMPLE_COUNT; ++i) batch[i] = samples[i];
  }
  portEXIT_CRITICAL(&sampleMux);

  if (loggedSession != batchSession) {
    loggedSession = batchSession;
    firstPacketSent = false;
    mtuWarning = false;
  }
  if (canNotify != notificationsEnabled) {
    notificationsEnabled = canNotify;
    Serial.println(canNotify
      ? "[BLE] Notificaciones activadas. Array reiniciado; esperando primera subida."
      : "[BLE] Captura desactivada. Array descartado.");
  }

  // Estar conectado no basta: el móvil debe haberse suscrito a los datos.
  if (ready && canNotify) {
    // Construimos {"arr":[valor1,...,valor10]} sin necesitar ArduinoJson.
    // 120 bytes cubren los 10 números más grandes posibles, signos y final de texto.
    char packet[120];
    // snprintf escribe texto con un límite de tamaño y devuelve cuántos caracteres añadió.
    size_t length = snprintf(packet, sizeof(packet), "{\"arr\":[");
    for (uint8_t i = 0; i < SAMPLE_COUNT; ++i) {
      // Escribimos a continuación de lo anterior. Solo añadimos coma desde el segundo valor.
      // %lu imprime un unsigned long como número decimal.
      length += snprintf(packet + length, sizeof(packet) - length,
                         i == 0 ? "%lu" : ",%lu", (unsigned long)batch[i]);
    }
    length += snprintf(packet + length, sizeof(packet) - length, "]}");

    // Comprobamos que siga siendo la misma conexión y que quepa el mensaje entero.
    // MTU es el tamaño acordado con el móvil; BLE necesita 3 bytes adicionales.
    if (captureEnabled && session == batchSession) {
      const uint16_t mtu = server->getPeerMTU(server->getConnId());
      if (mtu < length + 3) {
        if (!mtuWarning) {
          Serial.printf("[BLE] Esperando un MTU mayor: actual=%u, necesario=%u.\n",
                        mtu, (unsigned int)(length + 3));
          mtuWarning = true;
        }
        delay(1);
        return;
      }
      mtuWarning = false;
      // La librería pide bytes (uint8_t*); reinterpret_cast presenta nuestro texto como bytes.
      data->setValue(reinterpret_cast<uint8_t*>(packet), length);
      data->notify();
      portENTER_CRITICAL(&sampleMux);
      // Volvemos a llenar desde la posición 0. No hace falta borrar los valores antiguos.
      // Si hubo una reconexión, no tocamos el contador de esa nueva conexión.
      if (session == batchSession) sampleCount = 0;
      portEXIT_CRITICAL(&sampleMux);
      if (!firstPacketSent) {
        Serial.println("[BLE] Primer bloque de 10 muestras enviado a Bluetooth.");
        firstPacketSent = true;
      }
    }
  }
  delay(1); // Cede CPU a BLE; los flancos se capturan por interrupción.
}
