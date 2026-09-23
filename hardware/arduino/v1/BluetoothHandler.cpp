#include "BluetoothHandler.h"
#include "Variables.h"
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

BluetoothHandler::BluetoothHandler() {}

void BluetoothHandler::begin(const char* deviceName) {
    BLEDevice::init(deviceName);
    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new MyServerCallbacks(this));

    BLEService *pService = pServer->createService(SERVICE_UUID);
    pCharacteristic = pService->createCharacteristic(
                        CHARACTERISTIC_UUID,
                        BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_WRITE
                    );

    pCharacteristic->setCallbacks(new MyCharacteristicCallbacks());
    BLEDescriptor *pDescriptor = new BLE2902();
    pCharacteristic->addDescriptor(pDescriptor);

    pService->start();
    startAdvertising();
}

void BluetoothHandler::startAdvertising() {
    BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(false);
    pAdvertising->setMinPreferred(0x0);
    BLEDevice::startAdvertising();
    Serial.println("Advertising started");
}

bool BluetoothHandler::isConnected() {
    return deviceConnected;
}

void BluetoothHandler::sendNotification(int value) {
    if (deviceConnected) {
        uint8_t data[4];
        memcpy(data, &value, sizeof(value));
        pCharacteristic->setValue(data, sizeof(data));
        pCharacteristic->notify();
    }
}

void BluetoothHandler::sendMidiNotification(int note, int velocity, long duration, int channel) {
    if (deviceConnected) {
        // Prepara el JSON para enviar
        StaticJsonDocument<256> doc;
        doc["note"] = note;
        doc["velocity"] = velocity;
        doc["duration"] = duration;
        doc["channel"] = channel;

        // Serializa el JSON a una cadena
        String jsonStr;
        serializeJson(doc, jsonStr);

        // Convierte la cadena JSON a un array de bytes
        const char* jsonData = jsonStr.c_str();
        size_t jsonSize = strlen(jsonData); // Calcula el tamaño del JSON en bytes

        // Envía el JSON como un array de bytes a través de la característica Bluetooth
        pCharacteristic->setValue((uint8_t*)jsonData, jsonSize);
        pCharacteristic->notify();
    }
}
void BluetoothHandler::sendArrNotification(volatile unsigned long* arr, byte size) {
    if (deviceConnected) {
        // Prepara el JSON para enviar
        StaticJsonDocument<256> doc;
        JsonArray array = doc.createNestedArray("arr");  // Crea un array JSON

        // Copia los elementos del array volátil al array JSON
        for (int i = 0; i < size; i++) {
            array.add((unsigned long)arr[i]);  // Asegúrate de eliminar el modificador 'volatile' al agregar al JSON
        }

        // Serializa el JSON a una cadena
        String jsonStr;
        serializeJson(doc, jsonStr);

        // Convierte la cadena JSON a un array de bytes
        const char* jsonData = jsonStr.c_str();
        size_t jsonSize = strlen(jsonData); // Calcula el tamaño del JSON en bytes

        // Envía el JSON como un array de bytes a través de la característica Bluetooth
        pCharacteristic->setValue((uint8_t*)jsonData, jsonSize);
        pCharacteristic->notify();
    }
}

void BluetoothHandler::setDeviceConnected(bool connected) {
    deviceConnected = connected;
}

void BluetoothHandler::MyServerCallbacks::onConnect(BLEServer* pServer, esp_ble_gatts_cb_param_t* param) {
    handler->setDeviceConnected(true);
    Serial.println("Device connected");
}

void BluetoothHandler::MyServerCallbacks::onDisconnect(BLEServer* pServer) {
    handler->setDeviceConnected(false);
    Serial.println("Device disconnected");
    pServer->startAdvertising();
}

void BluetoothHandler::MyCharacteristicCallbacks::onWrite(BLECharacteristic* pCharacteristic) {
    std::string value = pCharacteristic->getValue();
    if (!value.empty()) {
        Serial.print("Received Value: ");
        for (auto c : value) {
            Serial.print(c);
        }
        Serial.println();

        // Parse JSON
        DynamicJsonDocument doc(1024);
        deserializeJson(doc, value);
        if (doc.containsKey("QY8")) {
            QY8 = doc["QY8"];
        }
        if (doc.containsKey("channel")) {
            channel = doc["channel"];
        }
        if (doc.containsKey("controlNumber")) {
            controlNumber = doc["controlNumber"];
        }
        if (doc.containsKey("threshold")) {
            threshold = doc["threshold"];
        }
        if (doc.containsKey("threshMin")) {
            threshMin = doc["threshMin"];
        }
        if (doc.containsKey("threshMax")) {
            threshMax = doc["threshMax"];
        }
        if (doc.containsKey("currScale")) {
            currScale = doc["currScale"];
        }
        if (doc.containsKey("samplesize")) {
            samplesize = doc["samplesize"];
        }
    }
}
