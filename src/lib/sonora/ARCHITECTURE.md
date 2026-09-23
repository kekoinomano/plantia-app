# Audio común y composición por ondas

La composición vive exclusivamente en `../wave-music`. El registro contiene
Deep focus, Sleep, Lofi Ondas, Psicodélico y Studio Ghibli. Cada mood define capas,
frases, instrumentos y traducción de datos; el analizador, reloj y saludo son comunes.

`sonora` conserva la infraestructura reutilizable: presets y muestras, tipos de
eventos, diseños de síntesis, preparación de voces y DSP. `focus.ts` y
`orchestration.ts` exponen los perfiles/buses del registro de ondas; no contienen
reglas compositivas alternativas. `signal.ts` sólo define el formato crudo y
constantes compartidas de adquisición.

## Recorrido

1. `NativeAudio` recibe un paquete BLE y lo entrega a `WaveComposer` con el reloj
   de audio. No filtra ni reduce ese paquete a un gesto musical.
2. El detector crudo identifica extremos; el analizador ajusta ventanas de 3/8 s.
3. Un mood construye el siguiente compás con memoria de frase y fuentes explícitas.
4. Se emiten notas, expresiones y releases hacia `NativeSynth`.
5. `prepareVoice` prepara la envolvente, muestra y parámetros; `NativePcmCore`
   utiliza el DSP C++ existente. `AudioCore` es su equivalente portable JS.
6. La cola PCM conserva las colas de efectos. Pausa, desconexión y cambio de mood
   invalidan la composición anterior; nunca se reproduce un backlog de compases.

`LiveMusicEngine` también usa WaveComposer, sin motor alternativo. Las herramientas
`wave-replay.mjs` y `render-mood.mjs` reproducen paquetes crudos con sus tiempos.
Su reloj virtual espera al analizador; no emula latencia BLE ni bloqueos del móvil.

No se usa un bundle worklet duplicado. `scripts/build-sonora.mjs` únicamente
mantiene el índice estático de muestras para Metro. No se ha ejecutado en esta
revisión, ni se han ejecutado tests, renders o compilaciones.

Los IDs antiguos desconocidos vuelven al perfil por defecto. `lofi` se migra a
`lofi-waves`. Los campos de configuración de synth/instrument y el bus silencioso
`$greeting` permanecen por compatibilidad con el protocolo del renderer: no son
un segundo motor ni una fuente independiente de saludos.

Diseño musical y fuentes: [WAVE_MOODS.md](../../../docs/music/WAVE_MOODS.md).
