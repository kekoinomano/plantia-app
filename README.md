# Plantia · Sonora nativa

App Expo SDK 57 para escuchar una planta por Bluetooth en iOS y Android. Una pantalla, sin identificación, cuentas ni grabaciones.

## Ejecutar en el móvil

```sh
npm install
npm run ios -- --device
# O con un Android conectado y su SDK instalado:
npm run android -- --device
```

Después de instalar la compilación de desarrollo, `npm start` inicia Metro para usarla. **No funciona con Expo Go**: Bluetooth y el renderizador de audio requieren los módulos nativos incluidos en esta compilación. iOS requiere Xcode y la firma habitual de tu equipo; Android requiere Android Studio/SDK. Los identificadores iniciales son `com.plantia.app`.

Para volver a abrir Plantia en el simulador sin compilar: `npm run ios:open`. Los pods son las dependencias nativas de iOS; su primera instalación y compilación puede tardar varios minutos. Solo necesitas `npm run ios` otra vez si cambias dependencias o configuración nativa. El simulador permite revisar la interfaz y el audio, pero para conectar el sensor Bluetooth necesitas un iPhone físico.

Enciende el sensor y desconéctalo de la web si estaba conectado allí. Pulsa **Conectar planta** y permite Bluetooth. Se conecta al primer sensor cercano que anuncia el servicio de Plantia. Las tarjetas de synth e instrumento abren todos los presets y parámetros; **Ritmo y mezcla** controla los volúmenes. El botón de pausa mantiene la conexión; tocar **Planta conectada** la cierra.

## Audio y segundo plano

- El análisis de señal, los gestos y el compositor de `src/lib/sonora` siguen decidiendo la música: 20 synths y 17 instrumentos. `plant-live-engine.ts` y el DSP portable se conservan para la referencia y las comprobaciones existentes.
- `src/lib/audio/native-synth.ts` usa los osciladores, muestras, envolventes y efectos **nativos de `react-native-audio-api`**. JavaScript solo analiza paquetes BLE y programa notas completas. Se elimina el cálculo continuo de PCM en Hermes, el worker productor y la cola que se vaciaba. No hay temporizador ni callback de JavaScript que tenga que entregar el siguiente bloque al altavoz.
- Se utiliza la frecuencia preferida del dispositivo, sin limitar la síntesis a 24 kHz. Tras el análisis en ventanas de 250 ms, cada grupo de notas recibe 50 ms de margen de programación, conservando sus intervalos musicales; no se añaden segundos de reserva. La latencia completa también depende de la llegada de paquetes BLE.
- Las voces tienen límites de polifonía, envolventes y finales programados nativamente. Los cambios de nivel y la sustitución de voces se suavizan; un limitador suave contiene los picos. Si no llegan paquetes válidos durante 1,5 segundos, la salida se desvanece aunque JavaScript esté detenido. Los efectos utilizan tres ecos acotados, chorus y dos reverberaciones compartidas. Conservan los controles y los diseños armónicos, pero el timbre de esta implementación nativa no es idéntico muestra a muestra al DSP portable.
- Las 70 muestras MP3 se incluyen en la app. Se decodifican, recortan y normalizan igual que en la web; solo se retienen el instrumento seleccionado y el arpa. No requiere red en una compilación instalada con sus assets.
- iOS declara `audio` y `bluetooth-central`, con sesión de reproducción. Android declara el servicio en primer plano `mediaPlayback|connectedDevice` y su notificación. Incluye controles del sistema, interrupciones y pausa al quitar auriculares.
- Bloquear la pantalla o cambiar de app mantiene la sesión. El plugin local `with-background-playback` corrige el valor `stopWithTask` del servicio Android para que quitar la actividad de recientes no solicite detenerlo. Forzar la detención desde ajustes de Android, cerrar forzosamente en iOS o que el sistema mate el proceso detiene la música.
- La gráfica conserva hasta doce segundos de lecturas, se anima en el hilo de UI y deja de actualizar la pantalla al pasar a segundo plano. No se guarda la sesión.

Protocolo BLE: servicio `4fafc201-1fb5-459e-8fcc-c5c9c331914b`, característica de notificaciones `beb5483e-36e1-4688-b7f5-ea07361b26a8`, JSON `{"arr":[10 enteros]}`; se solicita MTU 247 en Android.

## Cambiar Sonora

Edita el compositor en `src/lib/sonora` y el renderizador móvil en `src/lib/audio/native-synth.ts`. `npm run sonora:build` sigue generando el worklet portable de referencia y el índice estático de muestras, también antes de `npm start`, `npm run ios` y `npm run android`. La reproducción móvil ya no importa ese worklet. No edites `src/lib/audio/sonora-runtime.ts` ni `sample-assets.ts` a mano.

El cambio al grafo nativo se ha comprobado con `npm run typecheck`; no se han añadido tests ni benchmarks. **Queda pendiente escuchar esta implementación en iPhone y Android físicos con el sensor**, incluyendo pantalla bloqueada, llamada/interrupción y auriculares. Reconstruye Android para instalar el cambio del servicio. El simulador y la vista web (`npm run web`) sirven para revisar la interfaz; no validan BLE ni segundo plano.

## Créditos

FluidR3 GM, Frank Wen y colaboradores; MIDI.js Soundfonts, Benjamin Gleitzman y colaboradores. Licencia CC BY 3.0. La atribución completa está en `assets/audio/sonora/ATTRIBUTION.txt` y accesible en la pantalla principal al tocar «Hecho con Sonora».

Referencias de integración: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [osciladores nativos](https://docs.swmansion.com/react-native-audio-api/docs/sources/oscillator-node/), [muestras y notas programadas](https://docs.swmansion.com/react-native-audio-api/docs/sources/audio-buffer-source-node/), [configuración nativa de audio](https://docs.swmansion.com/react-native-audio-api/docs/other/audio-api-plugin/), [servicio de reproducción Android](https://developer.android.com/media/media3/session/background-playback), [Bluetooth BLE](https://dotintent.github.io/react-native-ble-plx/).
