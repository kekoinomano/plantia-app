# Biblioteca SFZ local de Plantia

## Instrumentos activos en los moods

Sleep, Deep Focus y lofi usan el **Steinway B compacto**. Conserva 42 notas grabadas a intensidad media y 33 muestras de liberación, en FLAC estéreo de 24 bits. Ghibli usa un Steinway de tres intensidades grabadas (vl2, vl3 y vl4) en el registro 39–82, con 23 notas por capa y 23 muestras de liberación. La velocidad MIDI cambia el timbre y el nivel del piano de Ghibli. Los otros instrumentos melódicos conservan sus zonas y articulaciones seleccionadas; la batería usa dos intensidades suaves y dos repeticiones por golpe. Sus WAV se han convertido a FLAC sin pérdida en la parte conservada.

| Programa SFZ | Papel actual | Muestras | Paquete |
| --- | --- | ---: | ---: |
| Steinway B compacto | piano en Sleep, Deep Focus y lofi | 75 | 87,0 MiB |
| Steinway B Ghibli | piano expresivo en Ghibli | 92 | 157,0 MiB en tres paquetes |
| Flauta dulce grave, sustain | respuesta en Ghibli | 12 | 3,2 MiB |
| Órgano renacentista, Full | fondo puntual en Ghibli | 27 | 22,5 MiB |
| Vibráfono, mazas suaves | Deep Focus, lofi y respuesta psicodélica | 22 | 5,1 MiB |
| Strumstick | acompañamiento lofi | 57 | 20,7 MiB |
| Dan tranh, Normal | melodía psicodélica | 48 | 5,9 MiB |
| Bombo 2, golpes suaves | ritmo lofi | 4 | 0,23 MiB |
| Caja moderna, golpes suaves | ritmo lofi | 4 | 0,16 MiB |
| Hi-hat cerrado, golpes suaves | ritmo lofi | 4 | 0,17 MiB |

Los paquetes nuevos del piano de Ghibli añaden unos **157 MiB** a los instrumentos existentes. Cada paquete individual mide menos de 100 MB. `scripts/build-ghibli-piano.py` convierte desde el archivo VCSL local las tres intensidades necesarias, conserva las muestras de liberación y genera sus paquetes. `scripts/compact-vcsl-drums.py` selecciona, acorta y convierte los golpes de VCSL; `scripts/build-sfz-packs.py` empaqueta las otras carpetas compactas de `.sample-library/`. Los otros instrumentos preseleccionados siguen preparados allí para una integración posterior. VCSL no contiene un bajo melódico adecuado para el registro 33–48 de lofi: el bajo redondo, los pads y las texturas siguen siendo síntesis, sin archivos MP3.

## Reproducción

`SampleBank` instala únicamente los paquetes SFZ que necesita el mood elegido. `expo-asset` resuelve el paquete local, `react-native-zip-archive` lo extrae en una carpeta temporal y `expo-file-system` mueve la instalación terminada a `sfz-v2/`. Al actualizar una instalación anterior se elimina `sfz-v1/`, que contenía los pianos y WAV de la selección previa. Si falla la preparación de un SFZ, la app informa del error en vez de reproducir un MP3 antiguo.

El índice `sample-assets.ts` se ha eliminado y la app nativa ya no carga MP3. Los archivos de `assets/audio/sonora/` quedan como material de desarrollo para el renderizador antiguo de `moods:test`; no pertenecen al grafo de recursos de la app. Ese renderizador de prueba aún no reproduce los SFZ y sus MP3 no sirven para evaluar el timbre final.

El módulo nativo `PlantiaPcm` carga cada `.sfz` mediante **sfizz 1.2.3**. Android compila la biblioteca con CMake e iOS enlaza `modules/plantia-pcm/ios/vendor/Sfizz.xcframework`. Las notas SFZ usan el reloj del motor PCM y se mezclan en estéreo con los efectos existentes. sfizz lee las muestras desde archivos locales según las necesita; Plantia no decodifica el instrumento completo en JavaScript. El ajuste de referencia de 432/440/528 Hz se comunica a sfizz.

Los SFZ preservan sus zonas de teclado y su volumen relativo. La app transpone por octavas únicamente las notas que queden fuera del rango de cada instrumento. Las ganancias por instrumento compensan diferencias medidas de nivel entre bibliotecas; la dinámica entre notas continúa gobernada por la velocidad MIDI.

## Distribución

Los paquetes viajan dentro de la app y no requieren red. La descarga posterior desde R2 podrá reutilizar el mismo formato de paquete y la instalación local. Las fuentes de referencia son [VCSL](https://versilian-studios.com/vcsl/), [sfizz](https://github.com/sfztools/sfizz), [Expo Asset 57](https://docs.expo.dev/versions/v57.0.0/sdk/asset/) y [React Native Zip Archive](https://github.com/mockingbot/react-native-zip-archive). VCSL se publica bajo CC0; el Steinway compacto deriva de su SFZ y sus grabaciones originales.
