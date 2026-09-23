# Motor musical de ondas

El perfil `lofi-waves` usa el diseño y las fuentes de [DESIGN.md](../../../docs/lofi/DESIGN.md).
El historial de evaluación reproducible está en [REPORT.md](../../../output/lofi/REPORT.md).
Todos los moods usan este motor. Diseño y fuentes de los cuatro nuevos: [WAVE_MOODS.md](../../../docs/music/WAVE_MOODS.md). El informe de Lofi es histórico; no valida los moods nuevos.

## Responsabilidades

- `raw-buffer.ts` y `analysis.ts`: mismas ventanas/ajuste que el laboratorio, con
  cadencia 2 s, objetivo 95 % / 3 s y 80 % / 8 s, máximo ocho componentes.
- `features.ts`: media, RMS, pesos marginales y seguimiento aproximado de ondas.
- `analyzer.ts`: trabajo asíncrono único, sin cola atrasada. Introducción sobre
  ventana corta completa; promoción a ventana larga real cuando está disponible.
- `greeting.ts`: detector de extremos crudos, antes de Fourier y agrupación.
- `moods/lofi-language.ts`: conjuntos compatibles, roles, armonías, grooves,
  registros, niveles, límites y formas. No lee nombres de plantas ni archivos.
- `moods/lofi-mapping.ts`: escalas globales contrastadas con los cuatro registros.
- `moods/lofi.ts`: piano con motivo resuelto aprobado por escucha.
- `moods/shared.ts`: coordenadas, memoria de frase y límite de voces para los cuatro nuevos.
- `moods/deep-focus.ts`, `sleep.ts`, `psychedelic.ts`, `ghibli.ts`: capas y reglas propias.
- `moods/lofi-occupancy.ts`: comprueba las ventanas de notas y sus caídas; permite
  la base armónica bajo el solista, manteniendo líneas mono y presupuesto de voces.
- `composer.ts`: reloj, emisión, procedencia y sustitución del solista por saludo.
- `inspection.ts`: estado visible separado de los paquetes y del dibujo de ondas.

## Reproducción y pruebas

```sh
node scripts/calibrate-wave-lofi.mjs
node --test tests/wave-lofi.test.mjs
node scripts/evaluate-wave-lofi.mjs --label final --render
npm run sonora:build
npm run typecheck
```

`scripts/lib/wave-replay.mjs` usa paquetes y tiempos originales con el mismo
WaveComposer/analizador que la app. Su reloj virtual espera cada trabajo; no
emula bloqueos del móvil ni pérdidas BLE adicionales. Guarda tiempo de cómputo
por separado. La muestra PCM usa AudioCore, las mismas muestras y la preparación
mono/recorte/normalización de SampleBank. El render es JS, no una medición del
dispositivo ni una certificación nueva de paridad con C++.

## Memoria, fidelidad y tiempos

Los ajustes usan segundos del eje reconstruido, no necesariamente del reloj.
El 95/80 % son objetivos; no hay ocho ondas garantizadas. Los pesos no equivalen
al volumen. Se conserva la media de cada análisis, la referencia inicial y las
fuentes de motivo/frase; no se escribe un histórico persistente durante escucha.
En pruebas se guardan informes con SHA-256 de las entradas originales.

La memoria y los tiempos de renovación dependen del mood y se explican en el
panel. Lofi mantiene su pregunta/resolución; los cuatro nuevos comparten memoria
corta de dos compases e identidad por secciones. La media absoluta participa en
el tempo y la selección de centro tonal.

Saludo: cada mood define su gesto, pero el detector crudo es común. Calentamiento
2 s de recepción, referencia robusta, cooldown 8 s, rechazo de datos inválidos y
reinicio ante discontinuidades. Retira temporalmente el primer plano y mantiene
el fondo. Contador y procedencia cruda aparecen en panel y logs.

Los comandos anteriores se documentan para uso futuro; no se han ejecutado tests,
builds ni renders en la migración de los cuatro moods.

El catálogo tiene numerosas combinaciones teóricas, pero las elecciones están
correlacionadas por los datos. No se afirma que todo el producto cartesiano sea
alcanzable ni que equivalga a miles de temas perceptualmente distintos.
Las pruebas demuestran propiedades concretas; el gusto musical requiere escucha.
