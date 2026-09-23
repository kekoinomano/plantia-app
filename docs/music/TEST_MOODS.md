# Probar los moods con grabaciones

Desde la raíz del proyecto, con las dependencias instaladas y `ffmpeg` en PATH
(con codificador `libmp3lame`):

```sh
# Una planta y un mood
npm run moods:test -- --sample suegra2.json --mood lofi-waves

# Todas las plantas, un mood
npm run moods:test -- --mood deep-focus

# Una planta, todos los moods
npm run moods:test -- --sample suegra2.json

# Todas las plantas y todos los moods, incluidas comparaciones entre plantas
npm run moods:test
```

`--datasample` es un alias de `--sample`; admite un nombre dentro de `datasamples/`
o una ruta a un JSON. `lofi` es un alias de `lofi-waves`. Los moods se descubren
en el registro real de la aplicación, y los samples en `datasamples/*.json`.
Actualmente hay `lofi-waves`, `deep-focus`, `sleep`, `psychedelic` y `ghibli`.

Cada ejecución crea una carpeta independiente en `output/mood-tests/`, sin
sobrescribir ejecuciones anteriores. `--out ruta` cambia la carpeta padre.
Dentro encontrarás:

- `report.md`: resultados y enlaces a los audios.
- `report.json`: resultados detallados, umbrales, huellas SHA-256 de los inputs,
  diferencias por dimensión musical y métricas de audio.
- Un MP3 estéreo por combinación válida, a 22.050 Hz y 160 kbps.
- Un JSON por combinación con configuración, transformadas compactadas,
  compases y eventos emitidos, incluidos los saludos y las órdenes de liberar voces.

Los MP3 se generan también cuando fallan los criterios de variación. Un fallo
en una combinación se registra y no detiene las demás. Si no hay notas válidas,
no se genera un MP3 vacío. Las ejecuciones son secuenciales para limitar memoria.

## Qué se simula

Se reutilizan `wave-replay.mjs`, el `WaveComposer` y las reglas reales de cada
mood. Se entregan los paquetes originales en el orden y los tiempos de
`elapsed_ms`, sin normalizar las señales ni sustituir valores rechazados. Se
mantienen el análisis Fourier, la media, la memoria musical y el saludo previo
al análisis. Un eje temporal inválido se rechaza explícitamente.

El reloj avanza en pasos de 20 ms y espera a que termine cada análisis. No hay
que esperar en tiempo real la duración de la grabación. El render usa el DSP
JavaScript de Sonora y las muestras del proyecto: sirve para escuchar el arreglo
resultante, pero no mide latencias, cortes del dispositivo ni garantiza igualdad
bit a bit con el DSP C++ nativo. El comando carga TypeScript con esbuild en memoria;
no compila la aplicación ni ejecuta el resto de sus tests.

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

| Mood | Compases por bloque | Variación media mínima | Salto máximo entre bloques |
| --- | ---: | ---: | ---: |
| Lofi | 2 | 0,008 | 0,32 |
| Deep focus | 4 | 0,004 | 0,25 |
| Sleep | 4 | 0,002 | 0,20 |
| Psicodélico | 4 | 0,008 | 0,32 |
| Ghibli | 8 | 0,008 | 0,32 |

Se necesitan al menos tres bloques completos. El mínimo temporal detecta una
salida demasiado estática; el máximo señala cambios estructurales bruscos.
Los bloques agrupan células musicales para no tratar cada respuesta del motivo
como un cambio de identidad. Sleep admite movimientos menores y más lentos;
Ghibli se observa por frases completas. Una grabación corta como `suegra2.json`
puede generar su MP3 y aun así resultar **INSUFFICIENT**. No se repite ni alarga
artificialmente la señal para obtener un aprobado. Además, la memoria inicial
de un mood puede prolongar su introducción más allá del calentamiento Fourier.

Sin `--sample`, se comparan todos los pares dentro de cada mood usando el mismo
número de bloques iniciales completos en ambos, no el total desigual de notas
de grabaciones con duraciones diferentes. La distancia media entre bloques
equivalentes debe superar tanto **0,12** como **1,5 veces** la mayor variación
interna de ese tramo en cualquiera de las dos grabaciones. Se comparan tramos
equivalentes en compases, no necesariamente en segundos: el tempo puede cambiar.
Los pares sin tres bloques comparables también son insuficientes.

Estos umbrales iniciales no se han calibrado ejecutando la batería. Dos muestras
con señales parecidas pueden fallar el criterio entre plantas legítimamente:
el informe muestra falta de diferenciación, no exige inventar diferencias a
partir del nombre de la planta. Escucha los MP3 antes de decidir si necesitas
cambiar un mood o un umbral. Las distribuciones tampoco reconocen melodías por
su orden de notas ni evalúan conducción armónica, solapamientos o belleza.

El audio tiene un control adicional de valores finitos y señal no vacía.
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

La herramienta se ha preparado sin ejecutar tests ni generar audios en esta entrega.
