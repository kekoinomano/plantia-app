# saviasound · Sonora nativa

App Expo SDK 57 para escuchar una planta por Bluetooth en iOS y Android. Una pantalla, sin identificación, cuentas ni grabaciones.

## Ejecutar en el móvil

```sh
npm install
npm run ios -- --device
# O con un Android conectado y su SDK instalado:
npm run android -- --device
```

Después de instalar la compilación de desarrollo, `npm start` inicia Metro para usarla. **No funciona con Expo Go**: Bluetooth y el renderizador de audio requieren los módulos nativos incluidos en esta compilación. iOS requiere Xcode y la firma habitual de tu equipo; Android requiere Android Studio/SDK.

Para volver a abrir saviasound en el simulador sin compilar: `npm run ios:open`. Los pods son las dependencias nativas de iOS; su primera instalación y compilación puede tardar varios minutos. Solo necesitas `npm run ios` otra vez si cambias dependencias o configuración nativa. El simulador permite revisar la interfaz y el audio, pero para conectar el sensor Bluetooth necesitas un iPhone físico.

Enciende el sensor y desconéctalo de la web si estaba conectado allí. Pulsa **Conectar planta** y permite Bluetooth. Se conecta al primer sensor cercano que anuncia el servicio BLE compatible. Elige uno de los cinco moods y ajusta el volumen. La explicación del mood y el laboratorio muestran las ondas y sus decisiones musicales. El botón de pausa mantiene la conexión; tocar **Planta conectada** la cierra.

## Audio y segundo plano

- BLE y el compositor de `src/lib/wave-music` siguen decidiendo notas, expresiones y presets. El bucle de muestras de Sonora está implementado en `modules/plantia-pcm/cpp/Sonora.h`: se ejecuta al preparar PCM, nunca en el callback del altavoz. La preparación de voces se comparte con el DSP TypeScript mediante `prepareVoice`.
- `native-synth.ts` reproduce PCM estéreo con `AudioBufferQueueSourceNode`, a la frecuencia del dispositivo. Incluye chorus, eco, reverberación, envolventes y limitador. Conserva el estado entre bloques y cambios de configuración.
- Bloques de unos 40 ms, con una reserva de 1,2–2 segundos. El primer plan espera la ventana corta de 3 segundos del eje del sensor; la ventana larga usa 8 segundos. El retraso audible incluye análisis, BLE y la cola PCM. Los lotes de notas mantienen sus intervalos.
- Los finales dejan drenar los efectos. Un fundido programado nativamente protege el final de la cola aunque JS se bloquee. Pausa/cierre invalidan trabajos pendientes. Un vaciado produce nueva precarga y un log `UNDERRUN`.
- **Recompilación necesaria:** `npm run android` y, en iOS, `npx pod-install && npm run ios` incorporan el módulo local `PlantiaPcm`. Recargar Metro no es suficiente. Una instalación antigua muestra `NATIVE_MODULE_MISSING`, sin recurrir al render lento en Hermes.
- Logs `[saviasound PCM]`: `INIT`, `CONFIG`, `START`, `STATUS` cada dos segundos mientras se genera audio, `UNDERRUN`, `ERROR`, `PAUSE` y `CLOSE`. `CONFIG` muestra niveles y el estado/valores de cada efecto realmente enviados al motor; `[saviasound Music] NOTES` muestra las notas generadas y su retraso compositivo para distinguir una respuesta musical de un eco. Copia desde `INIT` hasta el fallo para diagnosticarlo.
- Las muestras del banco se incluyen en la app. Se decodifican, recortan y normalizan; se cargan los programas que necesita la paleta del mood seleccionado. No requiere red en una compilación instalada con sus assets.
- iOS declara `audio` y `bluetooth-central`, con sesión de reproducción. Android declara el servicio en primer plano `mediaPlayback|connectedDevice` y su notificación. Incluye controles del sistema, interrupciones y pausa al quitar auriculares.
- Bloquear la pantalla o cambiar de app mantiene la sesión. El plugin local `with-background-playback` corrige el valor `stopWithTask` del servicio Android para que quitar la actividad de recientes no solicite detenerlo. Forzar la detención desde ajustes de Android, cerrar forzosamente en iOS o que el sistema mate el proceso detiene la música.
- La gráfica conserva hasta doce segundos de lecturas, se anima en el hilo de UI y deja de actualizar la pantalla al pasar a segundo plano. No se guarda la sesión.

Protocolo BLE v2: servicio `df7167d3-4595-4d3e-b28d-f20ae4c87cdc`, característica de notificaciones `05cdaa8c-62b1-459e-a07f-1e4167b443c5`, JSON `{"arr":[10 enteros]}`; se solicita MTU 247 en Android. La búsqueda solo muestra dispositivos que anuncien ese UUID de servicio, sin filtrar por nombre. Actualiza también el firmware del ESP32; consulta la [documentación de Arduino v2](hardware/arduino/v2/README.md).

## Cambiar Sonora

Edita las reglas en `src/lib/wave-music/moods/` y el transporte en
`src/lib/audio/native-synth.ts`. Los cinco perfiles usan WaveComposer y el análisis
espectral compartido; el lofi conserva el piano con motivo resuelto aprobado.
Las decisiones y fuentes están en [WAVE_MOODS.md](docs/music/WAVE_MOODS.md).

Los cambios al bucle DSP requieren mantener sincronizado
`modules/plantia-pcm/cpp/Sonora.h`. `npm run sonora:build` sólo genera el índice
estático de muestras; ya no genera una copia del compositor en un worklet.

En esta migración no se han ejecutado tests, builds ni renders. Los cuatro moods
nuevos quedan pendientes de valoración auditiva en el dispositivo.

Para reproducir grabaciones, generar MP3 y medir variación entre señales y a lo
largo del tiempo: `npm run moods:test`. Admite filtros opcionales de planta y mood;
consulta [la guía de pruebas de moods](docs/music/TEST_MOODS.md).

## Créditos

FluidR3 GM, Frank Wen y colaboradores; MIDI.js Soundfonts, Benjamin Gleitzman y colaboradores. Licencia CC BY 3.0. La atribución completa está en `assets/audio/sonora/ATTRIBUTION.txt` y accesible en la pantalla principal al tocar «Hecho con Sonora».

Referencias de integración: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [osciladores nativos](https://docs.swmansion.com/react-native-audio-api/docs/sources/oscillator-node/), [muestras y notas programadas](https://docs.swmansion.com/react-native-audio-api/docs/sources/audio-buffer-source-node/), [configuración nativa de audio](https://docs.swmansion.com/react-native-audio-api/docs/other/audio-api-plugin/), [servicio de reproducción Android](https://developer.android.com/media/media3/session/background-playback), [Bluetooth BLE](https://dotintent.github.io/react-native-ble-plx/).
