# Probar los moods con grabaciones

Desde la raíz del proyecto, con las dependencias instaladas y `ffmpeg` en PATH
(con codificador `libmp3lame`):

```sh
# Una planta y un mood
npm run moods:test -- --sample suegra2.json --mood lofi-waves
npm run moods:test -- --suegra2 --mood ghibli

# Todas las plantas, un mood
npm run moods:test -- --mood deep-focus

# Una planta, todos los moods
npm run moods:test -- --sample suegra2.json

# Todas las plantas y todos los moods, incluidas comparaciones entre plantas
npm run moods:test
```

`--datasample` y `--suegra2` son alternativas de `--sample suegra2.json`; admite un nombre dentro de `datasamples/`
o una ruta a un JSON. `lofi` es un alias de `lofi-waves`. Los moods se descubren
en el registro real de la aplicación, y los samples en `datasamples/*.json`.
Actualmente hay `lofi-waves`, `deep-focus`, `sleep`, `psychedelic`, `ghibli`, `space`, `smooth-techno` y `jazz-session`.

Cada ejecución crea una carpeta independiente en `output/mood-tests/`, sin
sobrescribir ejecuciones anteriores. `--out ruta` cambia la carpeta padre.
Dentro encontrarás:

- `report.md`: resultados y enlaces a los audios.
- `report.json`: resultados detallados, umbrales, huellas SHA-256 de los inputs,
  diferencias por dimensión musical y métricas de audio.
- Un MP3 estéreo por combinación válida, a 48.000 Hz y 256 kbps.
- Un JSON por combinación con configuración, transformadas compactadas,
  compases y eventos emitidos, incluidos los saludos y las órdenes de liberar voces.

Los MP3 se generan también cuando fallan los criterios de variación. Un fallo
en una combinación se registra y no detiene las demás. Si no hay notas válidas,
no se genera un MP3 vacío. Las ejecuciones son secuenciales para limitar memoria.
El informe incluye pico y RMS PCM y comprueba que menos del 0,1 % de las
muestras quedan por encima de 0,85. Esto detecta compresión sostenida contra
el techo del motor; no sustituye una medición de loudness ni la escucha en el
altavoz del teléfono.

## Qué se simula

Se reutilizan `wave-replay.mjs`, el `WaveComposer` y las reglas reales de cada
mood. Se entregan los paquetes originales en el orden y los tiempos de
`elapsed_ms`, sin normalizar las señales ni sustituir valores rechazados. Se
mantienen el análisis Fourier, la media, la memoria musical y el saludo previo
al análisis. Un eje temporal inválido se rechaza explícitamente.

El reloj avanza en pasos de 20 ms y espera a que termine cada análisis. No hay
que esperar en tiempo real la duración de la grabación. El render compila una
pequeña herramienta macOS con el mismo `Sonora.h` y `sfizz` que el módulo nativo,
descomprime los paquetes SFZ/FLAC reales y reproduce los eventos, efectos y mezcla
del motor a 48 kHz. Requiere CMake (se usa el del Android SDK si está instalado),
un compilador C++ y `unzip`. El primer build puede tardar; se reutiliza en
`/tmp/plantia-mood-render-build`. Sigue sin medir latencias ni cortes del
dispositivo. El comando carga TypeScript con esbuild en memoria y no ejecuta
los demás tests.

## Criterios musicales

Se usan las notas realmente emitidas y compases completos. Se excluyen los
compases marcados como introducción o calentamiento. Cada bloque describe:
tempo, registro, densidad por pulso, duración de notas en pulsos, intensidad,
distribución de alturas, instrumentos y posiciones rítmicas en el compás.
Las percusiones no aportan alturas melódicas.

Las distancias están entre 0 y 1. Los pesos son: altura 25 %, instrumentos
20 %, tempo 15 %, ritmo 10 %, densidad 10 %, registro 8 %, duración 7 % e
intensidad 5 %. Tempo, registro, densidad, duración e intensidad alcanzan su
distancia máxima con diferencias de 30 BPM, 24 semitonos, 3 notas/pulso,
4 pulsos y 64 unidades de velocidad respectivamente. Las distribuciones usan
distancia de variación total. Son criterios de ingeniería explícitos, **no una
escala científica de calidad musical**.

En Ghibli, un 20 % de la distancia compara además pares sucesivos de notas
solistas por intervalo y separación rítmica; el 80 % restante conserva las
dimensiones anteriores. Así, dos frases con las mismas alturas pero en distinto
orden dejan de parecer idénticas al test. También se exige al menos un 25 % del
tiempo sin melodía principal, como máximo seis ataques sucesivos por compás y como
máximo cuatro notas simultáneas según los eventos emitidos. Estas cifras miden
la textura de la composición, no la duración exacta de las colas de muestra o
reverberación en Android.
En Space, el 10 % de la distancia observa también el orden y la separación de
notas principales; esto detecta motivos repetidos aunque cambie el timbre.

| Mood | Compases por bloque | Variación media mínima | Salto máximo entre bloques |
| --- | ---: | ---: | ---: |
| Lofi | 2 | 0,008 | 0,32 |
| Deep focus | 4 | 0,004 | 0,25 |
| Sleep | 4 | 0,002 | 0,20 |
| Psicodélico | 4 | 0,008 | 0,32 |
| Ghibli | 8 | 0,008 | 0,32 |
| Space | 4 | 0,008 | 0,32 |
| Smooth Techno | 4 | 0,008 | 0,32 |
| Jazz Session | 4 | 0,008 | 0,32 |

Se necesitan al menos tres bloques completos. El mínimo temporal detecta una
salida demasiado estática. El máximo base señala cambios estructurales bruscos;
cuando la distancia de la señal vegetal retenida para el bloque supera 0,45,
admite un margen proporcional de hasta 0,15. El informe conserva la distancia
de señal y el límite de cada transición para distinguir un cambio musical
justificado por la planta de un salto gratuito.
Los bloques agrupan células musicales para no tratar cada respuesta del motivo
como un cambio de identidad. Sleep admite movimientos menores y más lentos;
Ghibli se observa por frases completas. Una grabación corta como `suegra2.json`
puede generar su MP3 y aun así resultar **INSUFFICIENT**. No se repite ni alarga
artificialmente la señal para obtener un aprobado. Además, la memoria inicial
de un mood puede prolongar su introducción más allá del calentamiento Fourier.
En Smooth Techno, cada bloque representa cuatro compases, pero la variación
interna compara un bloque con el que ocupa la misma posición en el siguiente
ciclo de ocho compases. Así, el cambio armónico A/B previsto no infla la
variación atribuida a la planta. Una grabación necesita al menos dos bloques
del mismo lugar de la forma para evaluar esa continuidad.

Sin `--sample`, se comparan todos los pares dentro de cada mood usando el mismo
número de bloques iniciales completos en ambos, no el total desigual de notas
de grabaciones con duraciones diferentes. La distancia media entre bloques
equivalentes debe superar tanto **0,12** como **1,5 veces** la media de las
variaciones internas de ambas grabaciones en ese tramo. En Sleep se usa 1,25
por su vocabulario más restringido. Se comparan tramos
equivalentes en compases, no necesariamente en segundos: el tempo puede cambiar.
Los pares sin tres bloques comparables también son insuficientes.

Dos muestras con señales parecidas pueden fallar el criterio entre plantas legítimamente:
el informe muestra falta de diferenciación, no exige inventar diferencias a
partir del nombre de la planta. Escucha los MP3 antes de decidir si necesitas
cambiar un mood o un umbral. La comparación ordenada de Ghibli tampoco evalúa
conducción armónica ni belleza.

El audio tiene un control adicional de valores finitos y señal no vacía.
Cada nota musical se verifica además contra su análisis, regla y componentes
ponderadas en la traza; los saludos proceden de paquetes crudos y se excluyen
de esa comprobación.
Se informa del pico, RMS, primer ataque y mayor silencio por debajo de −80 dB
después del primer ataque. Los silencios no se suspenden automáticamente: su
significado depende del mood. El informe no sustituye una escucha.

## Ajustar criterios

`--thresholds ruta.json` permite cambiar los criterios sin tocar los moods:

```json
{
  "defaults": { "crossMin": 0.12, "crossRatio": 1.5 },
  "moods": {
    "sleep": { "blockBars": 4, "minimumBlocks": 3, "internalMin": 0.002, "internalMax": 0.20 }
  }
}
```

Los valores efectivos quedan guardados en cada informe. Un resultado `PASS`
significa que se han superado estos criterios, no que la música suene perfecta.
El proceso devuelve **0** si todo lo aplicable pasa, **1** si hay algún fallo o
error y **2** si solo quedan casos con datos insuficientes. Al seleccionar un
sample explícito se omiten las comparaciones entre grabaciones.

Las evaluaciones de Sleep y Ghibli de septiembre de 2026 se ejecutaron con
`moods:test`; los informes y MP3 están en `output/mood-tests/`.
