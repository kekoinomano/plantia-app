# Lofi de ondas: contrato de composición y evaluación

## Objetivo y método

Diseñar primero un espacio musical válido; después elegir dentro de él con datos.
La señal no tiene obligación de generar una nota nueva cada vez que cambia.
Mismos datos y tiempos → mismas decisiones. Las limitaciones son explícitas:
los periodos son del circuito, las frecuencias usan el eje reconstruido y el
ajuste no certifica actividad biológica. La media centrada sigue siendo una entrada.

## Investigación y decisiones

- [Native Instruments, Making lo-fi hip hop beats](https://blog.native-instruments.com/lo-fi-hip-hop-beats/):
  pulso relajado, armonía breve y cíclica y melodías repetitivas. Adoptamos 64–86 BPM,
  frases de ocho compases y una base que sobrevive a los descansos melódicos.
- [Native Instruments, Five key elements](https://blog.native-instruments.com/how-to-make-lofi-music/):
  sonido cálido, articulación humana y desarrollo por entrada/salida de capas.
  Adoptamos tres conjuntos compatibles, desplazamientos pequeños compartidos y
  dinámica subordinada al papel de cada instrumento. No son parámetros medidos
  de una grabación concreta ni reglas universales del género.
- [Native Instruments, Lo-fi chord progressions](https://blog.native-instruments.com/lo-fi-chord-progressions/):
  ciclos cortos, acordes de séptima y relaciones tonales. Seleccionamos progresiones
  mayores, menores y dóricas; conducción de voces y resoluciones de notas de paso.
- [Ableton, MPC-style swing](https://www.ableton.com/en/blog/get-mpc-swing-your-beats/):
  el swing forma parte del groove. Una única rejilla mueve todas las partes;
  no añadimos jitter aleatorio independiente a cada instrumento.
- [iZotope, Mixing sample-based music](https://www.izotope.com/community/blog/7-tips-for-mixing-sample-based-music):
  referencia de balance y compatibilidad de muestras. Comprobamos niveles y
  preparación de samples con el mismo DSP y normalización de la app.
- Grond y Berger, *Parameter Mapping Sonification*, capítulo 15 aportado en
  `inspiration/TheSonificationHandbook-chapter15.pdf`: las correspondencias
  perceptuales, el contexto y la cuantización son decisiones de diseño. No
  confundimos un ajuste preciso con una traducción musical agradable. Registramos
  procedencia, escalas y pérdida de información; el residuo no se convierte en ruido.

## Paleta cerrada inicial

| Conjunto | Base armónica | Primer plano | Bajo y batería | Carácter |
|---|---|---|---|---|
| Vibráfono suave | vibraphone, dos/tres voces | piano acústico con resolución | round-bass, soft-kick, soft-snare, soft-hat | redondo, sincopado |
| Piano íntimo | pianoforte, dos/tres voces | piano acústico con resolución | mismo soporte, articulación más espaciada | más acústico y abierto |
| Strumstick cálido | strumstick, dos voces | piano acústico con resolución | mismo soporte, hats discretos | punteado, decaimiento corto |

Versión elegida v12: piano acústico con motivo resuelto, integrado en el mood.
Pregunta de tres notas y respuesta de dos, tercera y quinta del acorde y llegada
más larga y suave a la tercera. El acompañamiento se reduce a dos voces por debajo
del piano. Se conservan el bajo, el groove y la armonía elegidos a partir de la
señal. La forma melódica de dos compases es una decisión estética fija; la planta
selecciona su contexto armónico, tempo, familia de base y dinámica. No se fuerza
un cambio de nota para evitar repeticiones. Ataque 8, release 22, room 12/35,
sin chorus ni oscilación de afinación en el piano y el acompañamiento.

Son presets del motor, sin atribuirles instrumentos reales distintos. No se
incluyen sitar, coros, cuerdas orquestales o drones sólo por estar disponibles.
Su incorporación necesitaría un conjunto coherente y nuevas pruebas. No se
promete saturación de cinta ni filtros que el DSP no implemente. Room corto por
bus; chorus mínimo sólo donde está configurado; delay apagado inicialmente.

## Gramática musical

- Base: 2–3 notas de acorde, registro MIDI 53–65, raíz reservada al bajo.
- Bajo: MIDI 33–48, raíz/tercera/quinta, 1–2 ataques por compás, mono, sin paseo continuo.
- Tema: MIDI 60–72; frase de 2–3 notas, una sola línea; respuesta de 1–2 notas.
- El tema puede coexistir con una base más baja y tenue si sus notas son compatibles.
  No hay prohibición global de solapamiento: hay presupuesto y jerarquía.
- Los finales y apoyos usan notas del acorde; los pasos pertenecen a la escala,
  son cortos y no forman semitono/octava menor sostenida contra las voces de base.
- Máximo de cinco voces afinadas simultáneas (3 base + 1 bajo + 1 solista).
  Las caídas forman parte del presupuesto. La reverberación no se cuenta como nota.
- Patrones de batería coherentes de dos compases; caja estable en 2/4, uno o dos
  bombos y hats con intensidad alternada. Nada de redobles automáticos por ruido.
- Cuatro disposiciones de ocho compases; el tema se recuerda y modifica con mesura.
  No rehacer toda la frase al girar la fase de una onda. No compases de silencio total.
- Duraciones expresadas en beats y segundos de caída; una línea mono acaba antes
  de la siguiente entrada. No colas solistas sobre un acorde nuevo incompatible.
- Familias, armonía y arreglo cambian en fronteras de frase; expresión cada compás;
  eventos extremos mediante saludo, sin esperar Fourier.

## Mapeo y calibración

Primero medir los cuatro registros con `RawBuffer`, `WaveAnalyzer` y `WaveComposer`
reales. Fijar escalas globales robustas con los rangos observados: no normalizar
cada planta por separado hasta hacerlas iguales. No identificar plantas por UUID,
nombre de archivo o nombre de especie. La calibración inicial no generaliza a
plantas o circuitos no representados: fuera del rango, saturar sin desorden.

La media absoluta decide parte del tempo y la familia; espectro y concentración,
modo/ruta/groove; contorno ponderado, frase; amplitud, dinámica acotada;
persistencia, duración; cambio entre ventanas, oportunidades de variación.
Ninguna onda secundaria se transforma obligatoriamente en otra pista. Sus pesos
se aplican una sola vez a la forma. Un gran vocabulario combinatorio no demuestra
miles de temas perceptualmente distintos: medir realizaciones y documentar límites.

## Saludo antes de Fourier

Detector sobre periodos crudos válidos, antes de agrupar: referencia robusta de
historia reciente, extremos relativos, confirmación y periodo refractario. Ignorar
arranque, paquetes corruptos y desconexiones. Un cambio de planta o de circuito
puede ser indistinguible de un extremo: llamarlo «evento inusual», no diagnóstico.
El bell tree común desplaza al solista durante el gesto,
no se añade encima. Caducidad corta y sin cola de saludos atrasados. Si no hay
armonía reciente, el gesto usa el centro tonal del mood y lo declara como tal.

## Evaluación reproducible

1. Reproducción de todos los paquetes, con `elapsed_ms`, secuencia y validación
   originales, más reloj musical en pasos de 20 ms. Sin sortear errores ni huecos.
2. Mismo ajuste asíncrono, compositor y configuración de la app. El reloj virtual
   espera a completar cada trabajo: mide el cómputo aparte; no emula carga BLE/OS.
3. Matriz de candidatos sobre escalas y selección de familias; conservar reporte
   antes/después, sensibilidad a cambios y estabilidad con señal semejante.
4. Invariantes: procedencia, rango, tonalidad, presupuestos, mono, continuidad,
   reproducibilidad, señal caducada, reset, pico aislado, pico sostenido y cooldown.
5. PCM con `AudioCore`, samples normalizados como `SampleBank`: finite, pico,
   RMS, duración de silencios, balance por capas. Revisión de paridad JS/C++.
6. Render de cada registro y una selección del saludo para escucha comparativa.
   Las métricas no califican belleza. No afirmar haber escuchado con una herramienta
   que sólo renderiza o mide; la aceptación estética final sigue abierta.

Los resultados, rangos, candidatos descartados y comandos se registrarán en
`output/lofi/REPORT.md`. No se cambian los registros originales.
