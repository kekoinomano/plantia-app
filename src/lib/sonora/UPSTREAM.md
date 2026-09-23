# Sonora: interfaz de audio

La composición se importa desde `wave-music`. El audio común mantiene presets,
preparación de muestras, eventos y DSP JS/C++; la especificación musical está en
[WAVE_MOODS.md](../../../docs/music/WAVE_MOODS.md).

```ts
const config = defaultConfiguration();
const mood = waveMood(config.profile)!;
const audio = new AudioCore(48000, config, bank);
const composer = new WaveComposer(config, mood, () => {
  composer.advance(audio.time);
  audio.schedule(composer.drain());
});
composer.push(packet, audio.time);
composer.advance(audio.time);
audio.schedule(composer.drain());
```

La integración necesita seguir llamando a `advance` con el reloj de reproducción,
incluso entre paquetes. En offline se espera `whenAnalysisIdle()` después de cada
paquete para reproducir el mismo análisis sin carreras con el reloj virtual.

Cargar los programas de `palettePresets(config.profile)` antes de reproducir.
Las muestras son mono `{ midi, rate, data: Float32Array }[]`; la decodificación es
responsabilidad de la plataforma. Preservar `assets/audio/sonora/ATTRIBUTION.txt`.

Las notas documentan el análisis de origen y su contexto musical. Los saludos
llevan `rawGreeting`, no una transformada inventada. El transporte conserva los
mensajes `note`, `expression` y `release`; esta migración no añade modelos C++.

No se han ejecutado tests, builds ni validación acústica de los cuatro moods nuevos.
