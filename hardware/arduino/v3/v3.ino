#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>

// ============================================================
// CONFIGURACIÓN
// ============================================================

constexpr uint8_t INPUT_PIN = 4;
constexpr uint8_t SAMPLE_COUNT = 10;

constexpr char SERVICE_UUID[] =
  "df7167d3-4595-4d3e-b28d-f20ae4c87cdc";

constexpr char DATA_UUID[] =
  "05cdaa8c-62b1-459e-a07f-1e4167b443c5";

// ============================================================
// BLE
// ============================================================

BLEServer* server = nullptr;
BLECharacteristic* data = nullptr;

// ============================================================
// ESTADO
// ============================================================

portMUX_TYPE sampleMux = portMUX_INITIALIZER_UNLOCKED;

volatile bool connected = false;
volatile bool captureEnabled = false;
volatile bool hasPreviousTime = false;

volatile uint32_t session = 0;
volatile uint32_t previousTime = 0;

volatile uint32_t samples[SAMPLE_COUNT];
volatile uint8_t sampleCount = 0;

// Solo para diagnóstico
volatile uint32_t totalPulses = 0;

// ============================================================
// MUESTRAS
// ============================================================

void resetSamples() {
  sampleCount = 0;
  previousTime = 0;
  hasPreviousTime = false;
  ++session;
}

// ============================================================
// INTERRUPCIÓN GPIO4
// ============================================================

void ARDUINO_ISR_ATTR onRise() {

  portENTER_CRITICAL_ISR(&sampleMux);

  totalPulses++;

  if (captureEnabled) {

    const uint32_t now = micros();

    // La primera subida solamente establece la referencia.
    if (hasPreviousTime && sampleCount < SAMPLE_COUNT) {
      samples[sampleCount] = now - previousTime;
      sampleCount++;
    }

    previousTime = now;
    hasPreviousTime = true;
  }

  portEXIT_CRITICAL_ISR(&sampleMux);
}

// ============================================================
// CALLBACK DE LA CARACTERÍSTICA
// ============================================================

class DataCallbacks : public BLECharacteristicCallbacks {

#if defined(CONFIG_NIMBLE_ENABLED)

  void onSubscribe(
    BLECharacteristic* characteristic,
    ble_gap_conn_desc* desc,
    uint16_t subValue
  ) override {

    // Bit 0 = notifications
    const bool notificationsEnabled = (subValue & 0x01) != 0;

    portENTER_CRITICAL(&sampleMux);

    captureEnabled = connected && notificationsEnabled;
    resetSamples();

    portEXIT_CRITICAL(&sampleMux);

    Serial.printf(
      "[BLE] Suscripcion modificada. subValue=%u, notifications=%s\n",
      subValue,
      notificationsEnabled ? "ON" : "OFF"
    );
  }

#endif
};

// ============================================================
// CALLBACKS DE CONEXIÓN
// ============================================================

class ConnectionCallbacks : public BLEServerCallbacks {

  void onConnect(BLEServer* pServer) override {

    portENTER_CRITICAL(&sampleMux);

    connected = true;
    captureEnabled = false;

    resetSamples();

    portEXIT_CRITICAL(&sampleMux);

    Serial.println(
      "[BLE] Movil conectado. Esperando suscripcion a notificaciones."
    );
  }

  void onDisconnect(BLEServer* pServer) override {

    portENTER_CRITICAL(&sampleMux);

    connected = false;
    captureEnabled = false;

    resetSamples();

    portEXIT_CRITICAL(&sampleMux);

    Serial.println("[BLE] Movil desconectado.");

    // Volvemos a anunciar Plantia
    pServer->startAdvertising();

    Serial.println(
      "[BLE] Disponible para conectar: anunciando Plantia."
    );
  }
};

// ============================================================
// SETUP
// ============================================================

void setup() {

  // ----------------------------------------------------------
  // SERIAL
  // ----------------------------------------------------------

  Serial.begin(115200);

  // Importante con USB CDC nativo del ESP32-C3
  delay(2000);

  Serial.println();
  Serial.println("======================================");
  Serial.println("Plantia ESP32-C3");
  Serial.println("======================================");

  Serial.printf(
    "[BLE] UUID servicio: %s\n",
    SERVICE_UUID
  );

  Serial.printf(
    "[BLE] UUID datos: %s\n",
    DATA_UUID
  );

  // ----------------------------------------------------------
  // GPIO4
  // ----------------------------------------------------------

  pinMode(INPUT_PIN, INPUT_PULLUP);

  Serial.printf(
    "[GPIO] GPIO%d inicial=%d\n",
    INPUT_PIN,
    digitalRead(INPUT_PIN)
  );

  attachInterrupt(
    digitalPinToInterrupt(INPUT_PIN),
    onRise,
    RISING
  );

  Serial.println(
    "[GPIO] Interrupcion RISING activada."
  );

  // ----------------------------------------------------------
  // BLE
  // ----------------------------------------------------------

  Serial.println("[BLE] Inicializando...");

  BLEDevice::init("Plantia");

  BLEDevice::setMTU(247);

  server = BLEDevice::createServer();

  server->setCallbacks(
    new ConnectionCallbacks()
  );

  BLEService* service =
    server->createService(SERVICE_UUID);

  data = service->createCharacteristic(
    DATA_UUID,
    BLECharacteristic::PROPERTY_NOTIFY
  );

  // IMPORTANTE:
  // En ESP32-C3/NimBLE NO gestionamos manualmente BLE2902.
  //
  // NimBLE crea automáticamente el CCCD para una
  // característica PROPERTY_NOTIFY.
  //
  // onSubscribe() nos avisa cuando el móvil activa/desactiva
  // las notificaciones.

  data->setCallbacks(
    new DataCallbacks()
  );

  service->start();

  // ----------------------------------------------------------
  // ADVERTISING
  // ----------------------------------------------------------

  BLEAdvertising* advertising =
    BLEDevice::getAdvertising();

  advertising->addServiceUUID(
    SERVICE_UUID
  );

  advertising->setScanResponse(true);

  advertising->start();

  Serial.println(
    "[BLE] Disponible para conectar: anunciando Plantia."
  );
}

// ============================================================
// LOOP
// ============================================================

void loop() {

  static uint32_t loggedSession = 0;

  static bool notificationsEnabled = false;
  static bool firstPacketSent = false;
  static bool mtuWarning = false;

  // Debug una vez por segundo
  static uint32_t lastDebug = 0;

  uint32_t batch[SAMPLE_COUNT];

  uint32_t batchSession;

  // ----------------------------------------------------------
  // COPIAMOS ESTADO DE FORMA SEGURA
  // ----------------------------------------------------------

  portENTER_CRITICAL(&sampleMux);

  const bool canNotify = captureEnabled;

  const bool ready =
    canNotify &&
    sampleCount == SAMPLE_COUNT;

  batchSession = session;

  if (ready) {

    for (uint8_t i = 0; i < SAMPLE_COUNT; ++i) {
      batch[i] = samples[i];
    }
  }

  portEXIT_CRITICAL(&sampleMux);

  // ----------------------------------------------------------
  // CAMBIO DE SESIÓN
  // ----------------------------------------------------------

  if (loggedSession != batchSession) {

    loggedSession = batchSession;

    firstPacketSent = false;
    mtuWarning = false;
  }

  // ----------------------------------------------------------
  // CAMBIO DE ESTADO DE NOTIFICACIONES
  // ----------------------------------------------------------

  if (canNotify != notificationsEnabled) {

    notificationsEnabled = canNotify;

    Serial.println(
      canNotify
        ? "[BLE] Notificaciones activadas. Esperando muestras."
        : "[BLE] Captura desactivada."
    );
  }

  // ----------------------------------------------------------
  // ENVÍO BLE
  // ----------------------------------------------------------

  if (ready && canNotify) {

    char packet[120];

    size_t length =
      snprintf(
        packet,
        sizeof(packet),
        "{\"arr\":["
      );

    for (uint8_t i = 0; i < SAMPLE_COUNT; ++i) {

      length += snprintf(
        packet + length,
        sizeof(packet) - length,
        i == 0 ? "%lu" : ",%lu",
        (unsigned long)batch[i]
      );
    }

    length += snprintf(
      packet + length,
      sizeof(packet) - length,
      "]}"
    );

    // --------------------------------------------------------
    // COMPROBAMOS QUE SIGA SIENDO LA MISMA SESIÓN
    // --------------------------------------------------------

    if (
      captureEnabled &&
      session == batchSession
    ) {

      const uint16_t mtu =
        server->getPeerMTU(
          server->getConnId()
        );

      // BLE necesita 3 bytes adicionales
      if (mtu < length + 3) {

        if (!mtuWarning) {

          Serial.printf(
            "[BLE] MTU insuficiente: actual=%u necesario=%u\n",
            mtu,
            (unsigned int)(length + 3)
          );

          mtuWarning = true;
        }

        delay(1);
        return;
      }

      mtuWarning = false;

      // ------------------------------------------------------
      // ENVIAMOS
      // ------------------------------------------------------

      data->setValue(
        reinterpret_cast<uint8_t*>(packet),
        length
      );

      data->notify();

      // ------------------------------------------------------
      // REINICIAMOS ARRAY
      // ------------------------------------------------------

      portENTER_CRITICAL(&sampleMux);

      if (session == batchSession) {
        sampleCount = 0;
      }

      portEXIT_CRITICAL(&sampleMux);

      // Solo imprimimos el primer paquete para no llenar
      // el puerto serie.
      if (!firstPacketSent) {

        Serial.println(
          "[BLE] Primer bloque de 10 muestras enviado."
        );

        Serial.print(
          "[BLE] Ejemplo: "
        );

        Serial.println(packet);

        firstPacketSent = true;
      }
    }
  }

  // ==========================================================
  // DEBUG CADA SEGUNDO
  // ==========================================================

  if (millis() - lastDebug >= 1000) {

    lastDebug = millis();

    uint32_t pulses;
    uint8_t count;

    portENTER_CRITICAL(&sampleMux);

    pulses = totalPulses;
    count = sampleCount;

    portEXIT_CRITICAL(&sampleMux);

    Serial.printf(
      "[DEBUG] connected=%d | capture=%d | samples=%u/10 | pulsos=%lu | GPIO4=%d\n",
      connected,
      captureEnabled,
      count,
      (unsigned long)pulses,
      digitalRead(INPUT_PIN)
    );
  }

  delay(1);
}