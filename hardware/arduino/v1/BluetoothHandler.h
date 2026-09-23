#ifndef BluetoothHandler_h
#define BluetoothHandler_h

#include "Arduino.h"
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <BLE2902.h>
#include <ArduinoJson.h> // Asegúrate de instalar esta biblioteca

class BluetoothHandler {
public:
    BluetoothHandler();
    void begin(const char* deviceName);
    bool isConnected();
    void sendNotification(int value);
    void sendMidiNotification(int note, int velocity, long duration, int channel);
    void sendArrNotification(volatile unsigned long* arr, byte size);
    void startAdvertising();
    void setDeviceConnected(bool connected);

private:
    BLEServer* pServer = nullptr;
    BLECharacteristic* pCharacteristic = nullptr;
    bool deviceConnected = false;
    bool oldDeviceConnected = false;

    class MyServerCallbacks: public BLEServerCallbacks {
    public:
        MyServerCallbacks(BluetoothHandler* handler) : handler(handler) {}
        void onConnect(BLEServer* pServer, esp_ble_gatts_cb_param_t* param) override;
        void onDisconnect(BLEServer* pServer) override;
    private:
        BluetoothHandler* handler;
    };

    class MyCharacteristicCallbacks: public BLECharacteristicCallbacks {
    public:
        void onWrite(BLECharacteristic* pCharacteristic) override;
    };
};

#endif
