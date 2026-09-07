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

- Se conserva el núcleo TypeScript completo de la web en `src/lib/sonora`, junto a `plant-live-engine.ts`: análisis de señal, gestos, compositor, 20 synths, 17 instrumentos y efectos.
- `react-native-audio-api` ejecuta el renderizador PCM estéreo a 44,1 kHz en **AudioRuntime**, fuera del hilo de React, sin temporizadores de JavaScript para programar sonido.
- `scripts/build-sonora.mjs` empaqueta las clases dentro de una única función worklet autónoma. Los mensajes entre runtimes usan `react-native-worklets`; el histórico de paquetes está acotado y se descartan notificaciones antiguas tras una suspensión.
- Las 70 muestras MP3 se incluyen en la app. Se decodifican, recortan y normalizan igual que en la web; solo se retienen el instrumento seleccionado y el arpa. No requiere red en una compilación instalada con sus assets.
- iOS declara `audio` y `bluetooth-central`, con sesión de reproducción. Android declara el servicio en primer plano `mediaPlayback|connectedDevice` y su notificación. Incluye controles del sistema, interrupciones y pausa al quitar auriculares.
- Bloquear la pantalla o cambiar de app mantiene la sesión. Forzar el cierre de la app detiene la música. Si deja de llegar señal, Sonora libera las voces en vez de inventar nuevos datos.
- La gráfica conserva hasta doce segundos de lecturas, se anima en el hilo de UI y deja de actualizar la pantalla al pasar a segundo plano. No se guarda la sesión.

Protocolo BLE: servicio `4fafc201-1fb5-459e-8fcc-c5c9c331914b`, característica de notificaciones `beb5483e-36e1-4688-b7f5-ea07361b26a8`, JSON `{"arr":[10 enteros]}`; se solicita MTU 247 en Android.

## Cambiar Sonora

Edita los originales en `src/lib/sonora` y ejecuta `npm run sonora:build`. El worklet y el índice estático de muestras se generan automáticamente también antes de `npm start`, `npm run ios` y `npm run android`. No edites `src/lib/audio/sonora-runtime.ts` ni `sample-assets.ts` a mano.

Comprobaciones breves: `npm run typecheck` y `npm test`. Se ha comprobado el empaquetado de iOS/Android, la configuración nativa y que el worklet serializado produce el mismo PCM que el núcleo original. **Queda pendiente probar en iPhone y Android físicos con el sensor**, incluyendo pantalla bloqueada, llamada/interrupción y auriculares. El simulador y la vista web (`npm run web`) sirven para revisar la interfaz; no validan BLE ni segundo plano.

## Créditos

FluidR3 GM, Frank Wen y colaboradores; MIDI.js Soundfonts, Benjamin Gleitzman y colaboradores. Licencia CC BY 3.0. La atribución completa está en `assets/audio/sonora/ATTRIBUTION.txt` y accesible en la pantalla principal al tocar «Hecho con Sonora».

Referencias de integración: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [AudioRuntime / worklets](https://docs.swmansion.com/react-native-audio-api/docs/worklets/worklets-introduction/), [configuración nativa de audio](https://docs.swmansion.com/react-native-audio-api/docs/other/audio-api-plugin/), [Bluetooth BLE](https://dotintent.github.io/react-native-ble-plx/).
