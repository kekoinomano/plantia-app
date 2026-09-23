
#define BUTTON_GPIO GPIO_NUM_33
#include "Variables.h"
#include "BluetoothHandler.h"
#include <driver/rtc_io.h>

//Para desactivar brownout
//#include "soc/soc.h"
//#include "soc/rtc_cntl_reg.h"


BluetoothHandler bluetooth;


// Function prototypes
void midiSerial(int type, int channel, int data1, int data2);
volatile bool interruptTriggered = false;
void setup()
{
  Serial.begin(115200); //for debugging 
  delay(100);
  //WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); // Desactivar el detector de brownout
  Serial.println("Hello World");
  delay(500);
  pinMode(interruptPin, INPUT_PULLUP);
  
  randomSeed(analogRead(0)); //seed for QY8 4 channel mode
  
  controlMessage.value = 0;  //begin CV at 0

  attachInterrupt(interruptPin, sample, RISING);
  bluetooth.begin("Plantia");  // Initialize the Bluetooth module

  Serial.println("Setup complete.");  
}

void loop()
{
  //checkbutton();
  if (!bluetooth.isConnected()) {
    bluetooth.startAdvertising();
    delay(1000);
  }
  else{
    currentMillis = millis();
    
    if (interruptTriggered) {
      Serial.println("Interrupción detectada.");
      interruptTriggered = false; // Restablece el indicador
    }
    //if(sampleindex >= samplesize)  { analyzeSample(); }
    if(sampleindex >= samplesize)  { sendArr(); }

  }
}






void sendArr()
{
  bluetooth.sendArrNotification(samples, samplesize);
  //reset array for next sample
  sampleindex = 0;
}

/*
//interrupt timing sample array
void sample()
{
  interruptTriggered = true;
  if(sampleindex < samplesize) {
    samples[sampleindex] = micros() - microseconds;
    microseconds = samples[sampleindex] + microseconds; //rebuild micros() value w/o recalling
    sampleindex += 1;
  }
}
void analyzeSample()
{
  unsigned long currentMillis1 = millis();  // Obtener el tiempo actual
  unsigned long random_time = random(600,2500);
  unsigned long averg = 0;
  unsigned long maxim = 0;
  unsigned long minim = 100000;
  float stdevi = 0;
  float stdevi_sqrt = 0;
  unsigned long delta = 0;
  byte change = 0;

  if (sampleindex >= samplesize) { //array is full

    unsigned long sampanalysis[analysize]; //copy to new array - is this needed?
    for (byte i=0; i<analysize; i++){ 
      //skip first element in the array
      sampanalysis[i] = samples[i+1];  //load analysis table (due to volitle)
      //manual calculation
      if(sampanalysis[i] > maxim) { maxim = sampanalysis[i]; }
      if(sampanalysis[i] < minim) { minim = sampanalysis[i]; }
      averg += sampanalysis[i];
      stdevi += sampanalysis[i] * sampanalysis[i];  //prep stdevi
    }

    //calculation
    averg = averg/analysize;
    stdevi_sqrt = stdevi / analysize - averg * averg;
    if(stdevi_sqrt < 0){
      stdevi_sqrt = 1.0;
    }
    stdevi = sqrt(stdevi_sqrt); //calculate stdevu
    if (stdevi < 1) { stdevi = 1.0; } //min stdevi of 1
    delta = maxim - minim; 
    
    //**********perform change detection 
    if (delta > (stdevi * threshold)){
      change = 1;
    }else{
      if (currentMillis - previousMillis > random_time) {
        Serial.print("No ha cambiado pero tocamos nota!");
        change = 1;
      }else{
        Serial.print("No ha cambiado");
      }
    }
    //*********
    
    if(change){

      //analyze the values
       int dur = 150+(map(delta%127,0,127,100,5500)); //length of note
       int ramp = 3 + (dur%100) ; //control slide rate, min 25 (or 3 ;)
        byte vel = 100;  // this value should modulate 
        
       int setnote = map(averg%127,0,127,noteMin,noteMax);  //derive note, min and max note

       setnote = scaleNote(setnote, scale[currScale], root);  //scale the note

        String message = String("Note: ") + String(setnote) + String(", Scale: ") + String(currScale) + String(", threshold: ") + String(threshold) + String(", threshMin: ") + String(threshMin) + String(", threshMax: ") + String(threshMax) + String(", QY8: ") + String(QY8) + String(", channel: ") + String(channel) + String(", controlNumber: ") + String(controlNumber);
        Serial.println(message);
        if (currentMillis - previousMillis > random_time) {
          bluetooth.sendMidiNotification(setnote, vel, dur, channel);
          previousMillis = currentMillis1;
        }
        //bluetooth.sendMidiNotification(setnote, controlMessage.value, delta%127, channel);
      
    }else{
      String message = String("No hay cambio: ") + String(delta) + String(" < ") + String(stdevi) + String (" * ") + String(threshold);
      Serial.println(message);
     }
       
    //reset array for next sample
    sampleindex = 0;
  }
}


int scaleSearch(int note, int scale[], int scalesize) {
 for(byte i=1;i<scalesize;i++) {
  if(note == scale[i]) { return note; }
  else { if(note < scale[i]) { return scale[i]; } } //highest scale value less than or equal to note
  //otherwise continue search
 }
 //didn't find note and didn't pass note value, uh oh!
 return 6;//give arbitrary value rather than fail
}


int scaleNote(int note, int scale[], int root) {
  //input note mod 12 for scaling, note/12 octave
  //search array for nearest note, return scaled*octave
  int scaled = note%12;
  int octave = note/12;
  int scalesize = (scale[0]);
  //search entire array and return closest scaled note
  scaled = scaleSearch(scaled, scale, scalesize);
  scaled = (scaled + (12 * octave)) + root; //apply octave and root
  return scaled;
}

*/