# Sonora core v2

La arquitectura musical vigente está descrita en
[ARCHITECTURE.md](./ARCHITECTURE.md). `composer.ts` coordina señal, reloj y el único
director de `rules/orchestra.ts`.

El núcleo es TypeScript independiente de React, Bluetooth y AudioContext. La app
móvil decodifica las muestras y entrega al motor un banco
`Record<program, {midi, rate, data: Float32Array}[]>`.

## Contrato

```ts
const config = defaultConfiguration();
const composer = new Composer(config);
const audio = new AudioCore(48000, config, bank);
const signal = createSignalAccumulator((frame) => {
  composer.push(frame);
  audio.schedule(composer.drain());
});

signal.push({ seq: 0, elapsed_ms: 100, values: [/* diez números */] });
signal.advance(audio.time * 1000);
composer.advance(audio.time);
audio.schedule(composer.drain());
audio.render(leftFloat32, rightFloat32);
```

La configuración v2 contiene una armonía global, volúmenes por slot y elecciones
instrumentales compatibles. Los patches efectivos se regeneran desde el mood; sus
registros, efectos y articulación no son datos editables.

Los eventos del compositor son:

- `note`: voz, slot, altura, duración, velocidad, patch y explicación musical;
- `mix`: nivel y objetivos interpolados de delay, reverb y chorus por slot;
- `expression`: modulación tímbrica continua y acotada;
- `release`: liberación y cancelación de eventos pendientes del ámbito indicado.

`AudioCore.configure` conserva voces y colas cuando el layout no cambia. Un cambio
de mood reconstruye el layout; un cambio de volumen, armonía o instrumento actualiza
los canales existentes. El motor nativo C++ consume el mismo protocolo.

Los porcentajes de efectos son unidades propias de Sonora: delay usa mezcla wet y
tiempo inverso a `rate`; reverb combina cuatro líneas amortiguadas; chorus usa una
modulación corta estéreo. Los buses tienen historial, límite de voces, ducking y un
limitador maestro. Las muestras se interpolan linealmente y no tienen time-stretch.

`src/lib/audio/sonora-runtime.ts` se genera con `npm run sonora:build` y no se edita
a mano. La calidad estética requiere escucha real; los chequeos estructurales solo
verifican contrato y estabilidad.
