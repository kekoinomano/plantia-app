# Sonora core v1

Núcleo independiente de plataforma escrito en TypeScript. No importa React, DOM, Bluetooth, SQLite, AudioContext ni AudioWorklet. Sus cinco piezas son presets JSON, análisis de diez valores ordenados, detector de cambios, compositor de eventos y renderizador PCM estéreo. `index.ts` es el punto de entrada.

## Contrato

```ts
import {
  defaultConfiguration,
  Composer,
  AudioCore,
  createSignalAccumulator,
} from './index.ts';
const config = defaultConfiguration();
const composer = new Composer(config);
const audio = new AudioCore(48000, config, bank);
const signal = createSignalAccumulator((frame) => {
  composer.push(frame);
  audio.schedule(composer.drain());
});
// Reloj en segundos para eventos/audio; elapsed_ms en milisegundos para paquetes.
signal.push({
  seq: 0,
  elapsed_ms: 100,
  values: [/* exactamente 10 números */],
});
// En cada callback de audio, con reloj relativo al inicio de los paquetes:
signal.advance(audio.time * 1000);
composer.advance(audio.time);
audio.schedule(composer.drain());
audio.render(leftFloat32, rightFloat32);
```

`bank` es `Record<program, {midi, rate, data: Float32Array}[]>`. Los datos son PCM mono, con silencio inicial retirado y pico normalizado a 0,85. El decoder pertenece a la plataforma. La web utiliza `lib/sonora-bank.ts`; los MP3 están en `public/audio/sonora/`. Harp siempre debe estar disponible, aunque el instrumento sea otro. Para Choir and Organ se cargan `choir_aahs` y `church_organ`. Los instrumentos sin programa usan los modelos `chime`/`bowl`.

Al inicio del directo se añade un margen de 120 ms y se transforma el reloj de eventos al del dispositivo; ver `lib/plant-live-engine.ts`. Los timestamps son de llegada, no timestamps del ADC. La ventana de análisis, la confirmación de contacto y la latencia de audio se suman. Después de una suspensión se descarta audio atrasado.

## Presets y eventos exportables

`presets.json` contiene las 22 escalas, los 37 presets, los 20 diseños de synth (`synthVoices`), cuatro afinaciones rápidas y configuración inicial. `synth-voices.ts` define espectros, evolución, registros y fraseo; las octavas iniciales de synth se revisaron para separar registros, conservando los límites editados por el usuario. El campo `version: 1` identifica el formato. Los pitch classes usan C=0 … B=11. MIDI 60 es C4. Una octava N cubre las notas desde `12*(N+1)`. Las octavas permitidas van de 1 a 6.

Los eventos `{type: "expression", time, expression: {brightness, energy, direction, bands}}` actualizan también el timbre de las notas sostenidas; el DSP suaviza estos valores durante 180 ms.

Un evento de nota tiene `{type:'note', time, note:{id,time,sourceTime,source,midi,velocity,duration,lane,patch,color,pan}}`. `source` es la secuencia de la ventana que provocó la nota; las pruebas manuales usan -1. `lane` es `synth`, `instrument` o `greeting`. Cada nota guarda su preset completo para que un cambio posterior no reescriba el pasado. Un evento `{type:'release',time,lane?}` libera voces y cancela respuestas pendientes causadas antes de ese instante. `Composer.configure` libera synth/instrument; el saludo sigue su curso.

`AudioCore.configure(config, bank?)` cambia ganancias y efectos. La memoria de reverberación se conserva. Los cambios de parámetros son por bloque; no hay automatización de curvas de controles ni historial de presets grabado en la base de datos. `Composer.audition(lane,time)` genera una prueba explícita sin lecturas, con notas de la escala elegida.

## Unidades de DSP

Los porcentajes son controles normalizados propios de Sonora. La tabla original no especificaba tiempos físicos; no se afirma equivalencia sonora con otro sintetizador.

- Delay: wet 0–100 es mezcla seca/húmeda; rate 0–100 da `0,07 + 1,1*(1-rate/100)` segundos. Realimentación 0,32, cruce estéreo.
- Reverb: wet 0–100 mezcla; amount da realimentación `0,48 + 0,4*amount/100` de cuatro líneas amortiguadas. Reflexiones tempranas conservan ataques incluso al 100 % wet.
- Chorus: depth controla mezcla y hasta 3 ms de modulación alrededor de 18/21 ms; rate va de 0,08 a 1,2 Hz.
- Envelope: attack da `0,004 + máximo*(attack/100)^2` segundos (máximo 1,3 synth y 0,45 instrumento); release da `0,06 + 3,5*(release/100)^2` segundos. Curva suave. Off conserva el ataque y la liberación naturales mínimos para evitar clics; no es una compuerta instantánea.
- Tuning: A4 en Hz, entre 392 y 494. Velocity usa Center y Range (0–127), modulados por dirección, movimiento y detalle. Cero produce silencio en la voz elegida. El saludo usa intensidad propia.
- Tres buses, máximos de 6/8/4 voces con relevo de 25 ms, búferes de efectos acotados, tabla seno compartida. Las muestras se interpolan linealmente; no hay modelos neuronales ni grandes soundfonts en memoria.

## Integración móvil pendiente

Este paquete es extraíble; no es un plugin Flutter nativo ni un binario Android/iOS. Una adaptación puede portar `signal`, `gesture`, `composer` y `dsp` conservando el JSON y los eventos. La aplicación nativa debe decodificar los assets, entregar PCM, ejecutar el callback con el reloj correcto y gestionar foco/suspensión/auriculares. No trasladar red, React o SQLite al hilo de audio. Para una versión de producción móvil conviene sustituir las pequeñas asignaciones de JS por estructuras preasignadas y medir en móviles modestos.

El banco comprimido completo ocupa 1.489.480 bytes; el PCM decodificado ocupa más RAM. El adaptador web mantiene solo el banco elegido y el arpa, y envía nuevas muestras al Worklet solo al cambiar de instrumento. Esta cifra no incluye el runtime de una futura app Flutter. La exportación WAV tiene memoria proporcional a su duración; el directo no almacena toda la sesión.

## Créditos y validación

Incluir `audio/ATTRIBUTION.txt` y su enlace de licencia CC BY 3.0 al redistribuir las muestras. Hang Drum es una aproximación con steel drum; Koshi/Tibetan Bell son modelos. Los nombres de synths son presets de Sonora.

En el proyecto: `node --test tests/sonora.test.mjs tests/gesture.test.mjs tests/live-audio.test.mjs tests/connection-recording.test.mjs`. `node scripts/preview-sonora.mjs` genera un único fragmento real de albahaca en macOS usando afconvert como decoder de pruebas. El código de audio entregado no depende de afconvert. La demostración comprueba ataques y niveles, no sustituye escuchar y ajustar el resultado con el usuario.
