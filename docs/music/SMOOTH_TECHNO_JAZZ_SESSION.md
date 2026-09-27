# Smooth Techno y Jazz Session

## Investigación musical

**Smooth Techno** se rehizo como techno dub cálido. En el análisis de [Robert Hood de Ableton Learning Music](https://learningmusic.ableton.com/make-melodies/ride.html), un motivo electrónico breve conserva el pulso mientras evoluciona su sonido. El productor El Choop describe en [Ableton](https://www.ableton.com/es/blog/designing-dub-chords-in-ableton-live-with-el-chooppizza-hotline/) acordes menores, timbres modulados y ecos como núcleo del dub techno. [Attack Magazine](https://www.attackmagazine.com/technique/beat-dissected/basic-channel-style-dub-techno/) muestra bombo a negras, hat a contratiempo, acordes recortados y movimiento creado por delay. El [foro de Ableton](https://forum.ableton.com/viewtopic.php?t=88040) añade la práctica de hacer responder dos capas de acordes con distinta posición y filtrado. Son referencias de producción, no reglas obligatorias.

De ahí salen: 112–122 BPM en 4/4, cuatro bombos, caja en 2 y 4, hats a contratiempo y bajo sincopado fuera del bombo. Un sintetizador nuevo toca acordes dóricos cortos de tercera y séptima con delay; otro toca un motivo breve, sin el vibráfono y el piano eléctrico que antes daban al mood un carácter ajeno al techno. Una capa sintética tenue abre las semifrases y el octavo compás retira parte del pulso. La señal larga elige una de tres rutas armónicas y familias rítmicas; las ondas cortas modulan acentos y algún grado del cierre.

**Jazz Session** toma la gramática de un combo pequeño. [Berklee Jazz Piano](https://online.berklee.edu/courses/jazz-piano) trata ii–V–I, acordes de séptima, tensiones, comping y bajo caminante; [Berklee Jazz Bass](https://online.berklee.edu/courses/jazz-bass) añade notas del acorde y aproximaciones cromáticas. [Gary Burton en Berklee](https://online.berklee.edu/courses/gary-burton-jazz-improvisation) insiste en conducir terceras y séptimas y dar forma a la improvisación. [Open Studio](https://www.openstudiojazz.com/courses/fundamentals-of-jazz-drumming/) sitúa swing, plato, comping y bombo ligero en la batería; su [guía de piano](https://www.openstudiojazz.com/5-easy-jazz-piano-chords-that-sound-great/) explica la sincopación Charleston. En un [foro de pianistas de jazz](https://www.reddit.com/r/JazzPiano/comments/1wg8v3r/solo_comping_esp_bass_lines/) también se distingue el sostén de la mano izquierda de los acordes que acompañan al solista.

El arreglo usa una forma original de ocho compases con rutas ii–V–I y turnarounds, séptimas en todos los acordes, bajo que alterna dos tiempos y cuatro negras, piano en terceras y séptimas, saxo tenor como solista y vibráfono en las respuestas de cierre. El swing retrasa las corcheas débiles sin desplazar el pulso principal.

### Fraseo del saxo tenor

La revisión del solista se apoya en los materiales de [Steve Wilson para Open Studio](https://www.openstudiojazz.com/courses/fundamentals-of-jazz-saxophone/) sobre aproximación rítmica, solos líricos y construcción de un solo, y en el [curso de improvisación de Berklee](https://online.berklee.edu/courses/gary-burton-jazz-improvisation) sobre notas guía y conducción de voces. [Jazzadvice](https://www.jazzadvice.com/lessons/jazz-standard-melody/) describe frases que cruzan los límites del compás y desarrollan una idea en vez de encadenar notas del acorde. [Taming the Saxophone](https://tamingthesaxophone.com/lessons/tone-sound) explica la importancia de la articulación, la dinámica, la afinación expresiva y el vibrato para reconocer la voz del instrumento. De estas fuentes se derivan decisiones para **este** arreglo; no son reglas universales del jazz.

El error anterior era tratar cada compás como una serie aislada de dos o tres notas del acorde, con saltos grandes y ataques parecidos. Ahora hay motivos de dos compases que reaparecen con una dirección distinta: el primer apoyo cae en la tercera o séptima y las notas intermedias avanzan por grados de la escala. Las notas de cada frase se sostienen hasta la llegada de la siguiente; la muestra *staccato* se conserva en la biblioteca, pero no interrumpe las líneas ligadas. Los compases 3 y 7 dejan respirar al saxo y dan la respuesta al vibráfono. El banco sostenido limita la polifonía a una sola nota, suaviza los agudos y añade un vibrato muy ligero que aparece sólo tras medio segundo.

## Instrumentos reales del motor

| Función | Smooth Techno | Jazz Session |
| --- | --- | --- |
| Armonía | Sintetizador `techno-stab` con delay | Steinway SFZ/FLAC de tres velocidades |
| Solista | Sintetizador `techno-pulse` | Saxo tenor VCSL SFZ/FLAC sostenido; vibráfono en respuestas |
| Bajo | Modelo `round-bass` | Modelo `round-bass` |
| Batería | Bombo, caja y hat SFZ/FLAC | Hat y caja SFZ/FLAC a baja intensidad |
| Fondo | Sintetizador `techno-haze` ocasional | Sin pad continuo |

La biblioteca actual no incluye contrabajo acústico ni plato ride grabado. Jazz Session usa el bajo sintetizado y un hat suave para marcar el tiempo; no se presentan como muestras de esos instrumentos ausentes. Los sonidos SFZ se instalan desde los paquetes locales de la app y se reproducen en el mismo motor nativo que el resto de los moods.

## Relación con la planta

La entrada son **periodos eléctricos del circuito**, no una medida biológica directa. La [metodología de ondas](../../PLANT_WAVE_ANALYSIS.md) distingue ventana corta y larga; las ondas son componentes del ajuste de esos periodos sobre un eje reconstruido. No se usan sus frecuencias como frecuencias de notas.

| Rasgo de las ondas | Decisión musical | Escala de cambio |
| --- | --- | --- |
| Media larga y frecuencia ponderada | Centro tonal y objetivo de tempo | Al inicio de escena / cada dos compases |
| Anchura y actividad retenida | Ruta armónica y familia de motivo | Ocho compases, o un cambio grande detectado |
| Persistencia larga | Duración del pad y legato, o bajo en dos frente a cuatro | Frase |
| Células ponderadas de ondas cortas | Velocidad, acento, dirección de aproximación y nota de paso | Compás y ataque |

La forma, el pulso y las resoluciones armónicas se mantienen aunque las células cortas fluctúen. Así se oyen los matices de una misma planta sin que cada nueva ventana reescriba arbitrariamente la composición. Ante cambios grandes, el motor puede cambiar centro y ruta al límite de la frase.

## Evaluación

`npm run moods:test -- --mood smooth-techno` y `npm run moods:test -- --mood jazz-session` generan MP3 usando Sonora C++ y sfizz. La comparación de Smooth Techno enfrenta mitades **equivalentes** de su ciclo de ocho compases; comparar mitades consecutivas confundía la progresión armónica deliberada con variación causada por la planta. La grabación `suegra2.json` es demasiado breve para tres bloques completos de cuatro compases: permite revisar audio y notas, pero la variación temporal entre frases queda `INSUFFICIENT`.
