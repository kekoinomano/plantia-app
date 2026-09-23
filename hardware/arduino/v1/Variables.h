#ifndef VARIABLES_H
#define VARIABLES_H

#include <Arduino.h>
#include <EEPROM.h> //store and read variables to nonvolitle memory
#include <Bounce2.h>
#include <driver/adc.h>
#include "Variables.h"


constexpr int scaleCount = 6;
constexpr int scaleLen = 13;
constexpr int LED_NUM = 5;
constexpr byte samplesize_max = 10;
constexpr byte analysize = samplesize_max - 1;  // Calculated directly
constexpr byte polyphony = 5;

extern byte samplesize;
extern int maxBrightness;
extern int currScale;
extern int scale[scaleCount][scaleLen];
extern int root;

extern const byte interruptPin;
extern const byte knobPin;
extern Bounce button;
extern const byte buttonPin;
extern int menus;
extern int mode;
extern int currMenu;
extern int pulseRate;

//Boton
extern volatile bool buttonPressed;
extern volatile bool lastButtonState;
extern volatile unsigned long lastDebounceTime;
extern unsigned long debounceDelay;
extern unsigned long longPressTime;
extern unsigned long buttonPressStartTime;
extern bool prepareDeepSleep; 

extern int channel;
extern int noteMin;
extern int noteMax;
extern byte QY8;
extern byte controlNumber;
extern byte controlVoltage;
extern long batteryLimit;
extern byte checkBat;
extern byte timeout;
extern int value;
extern int prevValue;
extern volatile unsigned long microseconds;
extern volatile byte sampleindex;
extern volatile unsigned long samples[samplesize_max];
extern float threshold;
extern float threshMin;
extern float threshMax;
extern float knobMin;
extern float knobMax;
extern unsigned long previousMillis;
extern unsigned long currentMillis;
extern unsigned long batteryCheck;
extern unsigned long menuTimeout;

extern int ledPins[LED_NUM];
extern byte controlLED;
extern byte noteLEDs;

struct MIDImessage {
  unsigned int type;
  int value;
  int velocity;
  long duration;
  long period;
  int channel;
};

extern MIDImessage noteArray[polyphony];
extern int noteIndex;
extern MIDImessage controlMessage;

void initializeVariables();
void updateThreshold(float newThreshold);

#endif
