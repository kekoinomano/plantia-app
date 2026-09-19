# Plantia · Biblia del sonido y los moods

Estado documentado: 11 de septiembre de 2026. El código es la fuente de verdad;
este documento describe el criterio musical de la implementación actual.

## 1. Idea central

Plantia ofrece orquestas preparadas, no una colección de patches para editar. Cada
mood decide qué voces existen y cómo se relacionan. Un preset aporta el timbre en
bruto; el mood aporta la composición, el registro, la articulación y la producción.

Esto se aplica también a **Orgánico**. Ya no existe una excepción con dos sonidos
configurados libremente por el usuario.

El usuario solo puede decidir:

1. escala general del mood;
2. afinación general: 420, 432, 440 o 464 Hz;
3. volumen individual de cada voz;
4. sustitución de un instrumento por otro de la misma familia cuando el rol lo
   permita.

No puede editar presets de synth, octavas, notas sueltas, velocidad, movimiento,
envolvente, delay, reverb ni chorus. Estas decisiones pertenecen al director.

## 2. Reglas de oro

1. Todas las voces afinadas comparten clases de altura y afinación.
2. Cada sección tiene rol y registro: fundamento, pad, protagonista, contravoz,
   pulso o acento.
3. La armonía conserva contexto mediante progresión y conducción de voces.
4. La señal interpreta una partitura dentro de límites; no elige notas arbitrarias.
5. Pregunta, respuesta, tensión, resolución y silencio estructuran la repetición.
6. Los efectos cambian lentamente con la frase y el gesto; no se cambia el tiempo
   del delay en cada nota.
7. Los presets nunca pueden reintroducir su escala, registro o mezcla de catálogo.
8. No se atribuyen emociones ni estados biológicos a la señal: es una traducción
   artística.

## 3. Arquitectura

```text
Paquetes reales → signal.ts → Frame → intent.ts → MusicalIntent
                                                   ├→ partitura: notas y silencios
                                                   ├→ gesto: articulación y efectos
                                                   └→ expresión tímbrica continua
                                                                    ↓
                          Composer + reloj → DSP por slots → mezcla → limitador
```

| Archivo | Responsabilidad |
| --- | --- |
| `signal.ts` | Validación y resumen robusto de paquetes. |
| `intent.ts` | Carácter inmediato, huella y memoria reciente. |
| `moods.ts` | Orquestas, roles, registros, armonía y progresiones. |
| `presets.ts` | Timbres crudos y configuración v2 reducida. |
| `rules/orchestra.ts` | Único director musical para todos los moods. |
| `composer.ts` | Reloj, ciclo de sesión y distribución de eventos. |
| `modulation.ts` | Expresión continua y acotada. |
| `dsp.ts` / `Sonora.h` | Renderizadores JS y nativo equivalentes. |

`Configuration` solo conserva `mood`, `harmony`, `slots` con nivel y elección
instrumental, y unos valores internos de sesión. `sanitizeConfiguration` desecha
cualquier dato sonoro ajeno al mood y reconstruye los patches efectivos. Así no
puede reaparecer un efecto antiguo aunque llegue una configuración obsoleta.

## 4. De señal a intención

El acumulador recibe paquetes de diez valores finitos con secuencia creciente y los
agrupa en ventanas de 250 ms. Aplica una compresión logarítmica con signo y calcula
centro robusto, perfil de residuos, dispersión, rugosidad, pendiente y nueve bandas
DCT. Esas bandas describen la forma del paquete; no son frecuencias físicas en Hz.

La cadencia se mide antes de agrupar los frames musicales. La música abre desde el
primer frame con una frase segura. En paralelo, los primeros doce segundos forman
una calibración interna del detector: las irregularidades de conexión actualizan la
referencia pero nunca se convierten en un cambio de planta ni silencian la orquesta.
Cada intervalo válido posterior
entra en una ventana móvil de diez paquetes y se compara con una referencia lenta.
Un intervalo aislado fuera del rango entre un cuarto y cuatro veces la referencia se descarta;
tres intervalos extremos coherentes sí inauguran un nuevo régimen. Los cambios
moderados se confirman cuando tres ventanas consecutivas superan una relación de
1.65 o bajan de 0.61. Después hay 18 segundos de histéresis. Un hueco superior a
seis segundos reinicia la medición como desconexión, no como una planta muy lenta.

La memoria está limitada a 24 segundos y 96 frames. De ella salen tendencia,
volatilidad, recurrencia, ráfaga, rango, desviación, microcambio y giro. Estos datos
modifican densidad, respiración, motivo, articulación, efectos y aparición de voces
opcionales. Durante unas doce observaciones musicales el director escucha la
cadencia, variación y forma suavizadas. El contenido fija un perfil expresivo y la
cadencia absoluta fija una escena reconocible: cascada por debajo de 40 ms/paquete,
ondas por debajo de 140 ms, lírica por debajo de 350 ms y quietud por encima. No son
la misma melodía acelerada: cambian mapa de entradas, número de voces, uso de acordes
o líneas, sustain y cantidad de silencio. Cuando se confirma
otro régimen de paquetes se abre una época del arreglo: cambian raíz, registro,
velocidad, patrón y densidad, comienza una frase nueva y entra una voz distintiva
del ecosistema del mood. Si coincide con el saludo de conexión, la transformación
entra justo después para que el saludo no la tape. Las colas anteriores terminan naturalmente. Mientras
tanto, los gestos en vivo siguen respondiendo a cada lectura. Así dos señales
distintas no convergen continuamente hacia el mismo esqueleto ni la personalidad
salta por una anomalía aislada. Los ticks leen la última intención pero nunca inventan
mediciones. Un hueco de datos libera las voces y reinicia la memoria musical.

Los picos breves se conservan antes del resumen robusto de 250 ms. Un contraste
fuerte puede disparar el saludo con un solo frame; los gestos menores conservan la
confirmación en dos frames. El enfriamiento entre saludos es de 1,8 segundos.

La composición es determinista. Valores, secuencias, tiempos de paquete,
configuración y versión de Sonora idénticos producen los mismos eventos, notas,
efectos y saludos. La reproducción en vivo traslada una sola vez esa línea temporal
al reloj de audio sin sustituir los intervalos grabados por el momento de llegada.

## 5. Armonía, melodía y forma

`Patch.notes` usa clases 0…11 (`0=C`). Todos los roles afinados reciben la misma
lista, pero cada uno ocupa las octavas declaradas por el mood. La percusión no
afinada conserva sus IDs MIDI originales.

Las frases tienen 16 celdas. Cuatro frases describen un arco de mezcla de llegada,
crecimiento, apertura y reposo. Cada perfil dispone de otra velocidad, orden de
progresión, patrón de entradas y zona de registro. Orgánico y Sereno cambian sus
patrones melódicos; Deriva cambia nubes y destellos; Prisma cambia espiral y aura;
Ritual cambia la distribución euclídea, alientos y brasas. El director busca primero
tríadas mayores/menores, séptimas, sextas y acordes
sus2/sus4 completos dentro de la escala elegida; si ninguno cabe, usa una pila
diatónica. Las inversiones se eligen cerca de la voz anterior.

Las melodías no recorren todo el rango libremente. Tienen:

- una zona segura dentro del registro;
- movimiento preferentemente conjunto, limitado a siete semitonos;
- gravedad hacia el centro cuando se han desplazado demasiado;
- notas de acorde en puntos estructurales;
- resolución descendente o hacia una nota vecina para evitar repeticiones.

En Sereno, la zona alta del arpa termina antes que en otros roles. Esto evita la
repetición de la muestra más aguda, que resultaba seca y estridente.

## 6. Efectos por frase y por sonido

Los efectos no son constantes. El motor emite `mix` para cada slot con nivel, delay,
reverb, chorus y tiempo de transición. Hay dos escalas complementarias:

- **macro**: cada cuatro celdas se ajusta la profundidad del rol y la fase de la
  frase;
- **gesto**: inmediatamente antes de cada nota o capa se calcula otro objetivo a
  partir del rol, la razón musical, la articulación y un rasgo actual de la señal.

Por ejemplo, una pregunta puede acercarse ligeramente y una resolución alarga su
salida. Cada nota recibe ataque y release propios, pero las notas próximas de un
acorde rodado comparten un solo movimiento de bus. No se automatiza el tiempo del
delay por nota porque desplazar la lectura de una línea con audio dentro genera una
modulación de afinación y un eco artificial.

Los moods actuales mantienen el delay explícito apagado. Su continuidad sale de
notas largas, release y reverb difusa. La automatización actúa sobre un bus estable
por slot. Por ello cambia el espacio de
la voz y también sus colas existentes, como ocurriría al automatizar un canal real;
no crea una reverb independiente por nota. Los parámetros se interpolan para evitar
clics. Los logs `[Plantia Music]` de tipo `SCORE` muestran notas y objetivos de mezcla
para poder comprobar que no son iguales. Cada nota incluye `plantProfile`,
`plantEpoch`, `plantTempoScene`, `packetCadenceMs` y `packetTempoChange`; una razón que contenga
`packet-regime` identifica la transformación que siguió al cambio.

## 7. Moods

### Orgánico

- Meadow forma un fundamento cálido con pocos armónicos superiores.
- Harp conserva la identidad de pregunta/respuesta del Orgánico anterior, pero ahora
  comparte armonía y está dirigido por el mood.
- La cadencia elige entre cascadas de arpegios, ondas, líneas líricas
  espaciadas y acordes largos casi inmóviles. Cada escena tiene otra melodía raíz,
  no solo otro tempo.
- Dentro de una escena estable, cada frase cambia el mapa de entradas y mezcla
  solos, díadas, tríadas o acordes de cuatro voces según la lectura reciente. La
  planta conserva identidad sin quedar atrapada en un único arpegio.
- Pan Flute es un músico invitado oculto: la señal decide su entrada con un
  enfriamiento largo.
- Inicio: pentatónica mayor, 432 Hz, progresión `[0,3,4,1]`.

### Sereno

- Meadow sostiene la raíz grave cada ocho celdas.
- Peace forma una cama cálida de dos voces conducidas.
- Harp alterna acordes casi simultáneos y arpegios lentos ascendentes o descendentes,
  con silencios amplios. Actividad y firma deciden el acorde intermedio y su tamaño.
- El arpa no alcanza repetidamente su extremo agudo y sus acordes de resolución
  sostienen aproximadamente cinco celdas más su release.
- Shakuhachi responde en una posición variable de la segunda mitad de la frase. Su
  espera máxima depende del perfil de planta: la reactiva invita más respuestas y
  la contemplativa deja más silencio.
- Inicio: pentatónica mayor, 432 Hz, progresión `[0,3,4,1]`.

### Deriva

- Space Time mantiene el horizonte; Mandala renueva nubes de dos o tres voces.
- Crystal produce destellos condicionados por actividad y carga.
- Tibetan Bell aparece al cierre con carga alta o tras una espera prolongada.
- Inicio: Lydian, 440 Hz, progresión `[0,1,4,2]`.

### Prisma

- Velvet sostiene pedales modales sin curvas de afinación.
- Prism Dust cruza acordes cada cinco celdas y Beauty dibuja una línea estable.
- Sitar aparece en fronteras de frase. La psicodelia procede del ritmo cruzado,
  las inversiones y el estéreo, no de glissandi de sirena ni ecos dominantes.
- Inicio: Doric, 432 Hz, progresión `[0,3,1,4,2,0]`.

### Ritual

- Meditation mantiene la tierra tonal.
- Congas distribuye pulsos euclídeos y golpes fantasma según actividad.
- Shakuhachi crea llamada y respuesta; Kalimba ocupa contratiempos condicionales.
- Inicio: pentatónica menor, 440 Hz, progresión `[0,3,2,0]`.

## 8. Mezcla

Las capas MP3 de naturaleza se han retirado por completo. Las muestras instrumentales
afinadas adelantan su release cuando el archivo terminaría antes que la envolvente,
evitando cortes secos.

- Los valores de efectos del catálogo se descartan al crear el canal. Un cambio de
  volumen nunca restaura accidentalmente el chorus/reverb/delay del preset original.
- Los volúmenes de `Configuration.slots` sí son la base real de cada canal. La fase
  de la frase puede reducirlos temporalmente, pero nunca reemplazarlos por el valor
  fijo declarado en el mood.
- Fundamentos graves y percusión usan menos efecto para conservar claridad.
- La reverb usa ocho líneas de difusión, amortiguación de agudos y reducción de
  graves de entrada. Las reflexiones tempranas son secundarias frente a la cola.
- Pads ocupan más profundidad; protagonistas permanecen más cerca.
- Las entradas de acordes se escalonan en estéreo y los graves quedan centrados.
- El ducking de synth al entrar instrumentos y el limitador maestro siguen siendo
  compartidos, pero el ducking es leve y la ganancia maestra permite acercarse a
  nivel completo sin superar el techo de salida.

## 9. Cómo crear o cambiar un mood

Antes de programarlo, definir:

```text
Identidad audible:
Armonía y ritmo armónico:
Roles, registros y jerarquía:
Motivo, memoria y transformación:
Fases de densidad y silencios:
Datos que afectan cada decisión:
Rangos de delay/reverb/chorus:
Qué NO debe hacer:
```

Después se declara la orquesta en `moods.ts` y se añade una rama a
`OrchestraRules` solo si la gramática realmente cambia. Nunca se resuelve un mood
exponiendo el patch completo al usuario.

## 10. Límites honestos

La calidad profesional no se demuestra con TypeScript. Hay que escuchar sesiones
largas en móvil, auriculares, altavoz y mono. El DSP actual no ofrece EQ o pre-delay
independiente en los retornos, ni time-stretch para muestras. Las curvas de pitch
solo afectan synths. La escala global todavía está expresada respecto a C y no tiene
una tónica separada.

Referencias de diseño: el [manual de efectos de Ableton](https://www.ableton.com/en/manual/live-audio-effect-reference/)
separa reflexiones y cola difusa y recomienda suavizar los cambios de tamaño; su
[manual MIDI](https://www.ableton.com/en/live-manual/12/live-midi-effect-reference/)
explica sustain mediante longitud de nota/latch. El
[trabajo clásico de Schroeder](https://hajim.rochester.edu/ece/sites/zduan/teaching/ece472/reading/Schroeder_1962.pdf)
identifica baja densidad, coloración y flutter como defectos perceptivos de reverbs
simples. Estas ideas justifican la cola densa, amortiguada y estable usada aquí.

No editar a mano `src/lib/audio/sonora-runtime.ts` ni
`src/lib/audio/sample-assets.ts`. Tras cambios ejecutables se regenera con
`npm run sonora:build`.
