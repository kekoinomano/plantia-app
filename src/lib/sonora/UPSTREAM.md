# Sonora core v1

La arquitectura vigente de moods, reloj musical y modulación está descrita en
[ARCHITECTURE.md](./ARCHITECTURE.md). Las reglas originales viven ahora en
`rules/organic.ts`; `composer.ts` coordina la señal y el reloj.

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

`presets.json` contiene las 22 escalas, los 37 presets, los 20 diseños de synth (`synthVoices`), cuatro afinaciones rápidas y configuración inicial. `synth-voices.ts` define espectros, evolución y registros; las octavas iniciales de synth se revisaron para separar registros, conservando los límites editados por el usuario. El synth crea díadas estables dentro de su propia escala y las renueva con fundidos lentos: `synthMotion.transition` controla el fundido y `synthMotion.stability` el tiempo entre capas. El campo `version: 1` identifica el formato. Los pitch classes usan C=0 … B=11. MIDI 60 es C4. Una octava N cubre las notas desde `12*(N+1)`. Las octavas permitidas van de 1 a 6.

Los eventos `{type: "expression", time, expression: {brightness, energy, direction, bands}}` actualizan también el timbre de las notas sostenidas; el DSP suaviza estos valores durante 180 ms.

Un evento de nota tiene `{type:'note', time, note:{id,time,sourceTime,source,midi,velocity,duration,lane,patch,color,pan,fade?}}`. `source` es la secuencia de la ventana que provocó la nota; las pruebas manuales usan -1. `lane` es `synth`, `instrument` o `greeting`. Cada nota guarda su preset completo para que un cambio posterior no reescriba el pasado; `fade` permite que las capas del synth usen ataques y liberaciones ambientales. Un evento `{type:'release',time,lane?}` libera voces y cancela respuestas pendientes causadas antes de ese instante; el synth usa su liberación natural. `Composer.configure` libera synth/instrument; el saludo sigue su curso.

`AudioCore.configure(config, bank?)` cambia ganancias y efectos. La memoria interna de reverberación se conserva, pero no se mezcla en la salida mientras el efecto está apagado. Los cambios de parámetros son por bloque; no hay historial de presets grabado en la base de datos. `Composer.audition(lane,time)` genera una prueba explícita sin lecturas: el instrumento articula tres notas y el synth abre una díada ambiental.

## Unidades de DSP

### Fraseo guiado por la señal

El instrumento conserva un motivo de cuatro notas y proporciones rítmicas extraídas del perfil ordenado. Cierra la frase con una nota más larga y una pausa; modifica una célula del motivo por repetición según las nuevas lecturas. Las duraciones son compuertas de reproducción: no alargan artificialmente la resonancia de una muestra percutiva.

El synth renueva alternativamente dos capas, leyendo distintas posiciones del perfil para variar sus alturas e intervalos dentro de su escala independiente. El filtro respira lentamente sin modular la afinación. La misma secuencia de frames y configuración produce los mismos eventos; esto caracteriza la señal recibida, no identifica biológicamente una especie. Cambiar los volúmenes no reinicia las frases y los buses silenciados no provocan ducking.

Los logs `NOTES` incluyen `reason` y `phraseStep` para explicar el papel de cada nota además de su duración.

Los porcentajes son controles normalizados propios de Sonora. La tabla original no especificaba tiempos físicos; no se afirma equivalencia sonora con otro sintetizador.

- Delay: wet 0–100 es mezcla seca/húmeda; rate 0–100 da `0,07 + 1,1*(1-rate/100)` segundos. Realimentación 0,32, cruce estéreo.
- Reverb: wet 0–100 mezcla; amount da realimentación `0,48 + 0,4*amount/100` de cuatro líneas amortiguadas. Reflexiones tempranas conservan ataques incluso al 100 % wet.
- Chorus: depth controla mezcla y hasta 3 ms de modulación alrededor de 18/21 ms; rate va de 0,08 a 1,2 Hz. En el bus del synth, la energía de la señal modula suavemente esa profundidad alrededor del valor elegido.
- Envelope: en el instrumento moldea cada nota. En el synth pondera la aparición y el desvanecimiento sobre el tiempo de fundido ambiental, con un filtro paso bajo que evoluciona lentamente con la señal. Off conserva los mínimos naturales para evitar clics; no es una compuerta instantánea.
- Tuning: A4 en Hz, entre 392 y 494. Velocity usa Center y Range (0–127), modulados por dirección, movimiento y detalle. Cero produce silencio en la voz elegida. El saludo usa intensidad propia.
- Tres buses, máximos de 6/8/4 voces con relevo de 25 ms, búferes de efectos acotados, tabla seno compartida. Las muestras se interpolan linealmente; no hay modelos neuronales ni grandes soundfonts en memoria.

## Integración móvil pendiente

Este paquete es extraíble; no es un plugin Flutter nativo ni un binario Android/iOS. Una adaptación puede portar `signal`, `gesture`, `composer` y `dsp` conservando el JSON y los eventos. La aplicación nativa debe decodificar los assets, entregar PCM, ejecutar el callback con el reloj correcto y gestionar foco/suspensión/auriculares. No trasladar red, React o SQLite al hilo de audio. Para una versión de producción móvil conviene sustituir las pequeñas asignaciones de JS por estructuras preasignadas y medir en móviles modestos.

El banco comprimido incluye las muestras originales y 223.019 bytes de percusión adicional; el PCM decodificado ocupa más RAM. El adaptador mantiene solo el banco elegido, que también usa el saludo. La exportación WAV tiene memoria proporcional a su duración; el directo no almacena toda la sesión.

## Créditos y validación

Incluir `audio/ATTRIBUTION.txt` y su enlace de licencia CC BY 3.0 al redistribuir las muestras. Hang Drum es una aproximación con steel drum; Koshi/Tibetan Bell son modelos. Los nombres de synths son presets de Sonora.

En el proyecto: `node --test tests/sonora.test.mjs tests/gesture.test.mjs tests/live-audio.test.mjs tests/connection-recording.test.mjs`. `node scripts/preview-sonora.mjs` genera un único fragmento real de albahaca en macOS usando afconvert como decoder de pruebas. El código de audio entregado no depende de afconvert. La demostración comprueba ataques y niveles, no sustituye escuchar y ajustar el resultado con el usuario.
