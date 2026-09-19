// Variables.cpp
#include "Variables.h"

int maxBrightness = 190;
int currScale = 5;
int scale[scaleCount][scaleLen] = {
  {12,1,2,3,4,5,6,7,8,9,10,11,12}, //Chromatic
  {7,1, 3, 5, 6, 8, 10, 12}, //Major
  {7,1, 3, 4, 6, 8, 9, 11}, //DiaMinor
  {7,1, 2, 2, 5, 6, 9, 11}, //Indian
  {7,1, 3, 4, 6, 8, 9, 11}, //Minor
  {5,1, 3, 5, 8, 10} //Pentatonic
};
int root = 0;
const byte interruptPin = 4;
const byte knobPin = 35;
Bounce button = Bounce();
const byte buttonPin = 33;
int menus = 5;
int mode = 0;
int currMenu = 0;
int pulseRate = 350;
int channel = 11;
int noteMin = 36;
int noteMax = 96;
byte QY8 = 0;
byte controlNumber = 80;
byte controlVoltage = 1;
long batteryLimit = 3000;
byte checkBat = 1;
byte timeout = 0;
int value = 0;
int prevValue = 0;
byte samplesize = 10;
//Button
volatile bool buttonPressed = false;
volatile bool lastButtonState = HIGH;
volatile unsigned long lastDebounceTime = 0;
unsigned long debounceDelay = 50;
unsigned long buttonPressStartTime = 0;
unsigned long longPressTime = 2000;
bool prepareDeepSleep = false;

volatile unsigned long microseconds = 0;
volatile byte sampleindex = 0;
volatile unsigned long samples[samplesize_max];
float threshold = 1.7;
//float threshold = 2;
float threshMin = 1.61;
float threshMax = 3.71;
float knobMin = 1;
float knobMax = 1024;
unsigned long previousMillis = 0;
unsigned long currentMillis = 1;
unsigned long batteryCheck = 0;
unsigned long menuTimeout = 5000;
int ledPins[LED_NUM] = {32, 33, 25, 26, 27};
byte controlLED = 5;
byte noteLEDs = 1;
MIDImessage noteArray[polyphony];
int noteIndex = 0;
MIDImessage controlMessage;

void initializeVariables() {
    // Code to initialize hardware and variables
}

void updateThreshold(float newThreshold) {
    threshold = newThreshold;
}
