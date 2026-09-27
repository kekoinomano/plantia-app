# Moods sobre ondas: diseño, investigación y límites

El mood `space`, creado desde una semilla MP3, se documenta en [SPACE_MOOD.md](SPACE_MOOD.md).

Estado: Sleep y Studio Ghibli reescritos y evaluados con `moods:test` sobre las
cinco grabaciones. Los MP3 permiten la valoración auditiva; las métricas no
demuestran calidad musical percibida. Los otros moods no se han reescrito;
la corrección de transposición del compositor común afecta su registro.
La selección SFZ posterior cambió los timbres de los moods; las cifras de nivel
y las audiciones descritas más abajo corresponden a la selección anterior.

## Una sola fuente musical

Todos los perfiles usan `WaveComposer`: paquetes originales → detección cruda
de saludo → ajustes espectrales → coordenadas → reglas del mood → audio.
Se suprimen el compositor de gestos, su filtrado a 100 ms, memoria de motivos,
intérprete y orquestador alternativos. El laboratorio y la escucha comparten
los mismos ajustes: ventanas de 3 y 8 s, cada 2 s, objetivos 95 % y 80 %, máximo
8 componentes por ventana. Un objetivo no garantiza ese porcentaje ni ocho ondas.

Los pesos marginales describen cuánto mejora cada componente la reconstrucción.
La primera onda influye más cuando tiene mayor peso; no recibe por ello una
pista, un instrumento ni un volumen proporcional. Se mantienen la media corta,
la larga y la inicial en memoria, sin añadir persistencia a disco.

## Investigación y decisiones

### Deep focus

[Ableton, análisis de “Ride”](https://learningmusic.ableton.com/make-melodies/ride.html)
explica cómo una célula repetida puede sostener interés mediante cambios lentos
de timbre. Se toma ese principio compositivo, no su batería ni una supuesta
validación de concentración. La concentración no exige melodías nuevas en cada
ventana: demasiadas entradas y cambios llaman la atención.

Decisión de diseño: ambient de cámara pentatónico, dos voces sintéticas de
ataque lento y dos notas de teclas en compases alternos. El compás siguiente
mantiene el fondo y deja descansar el primer plano. Un espectro ancho permite
un cambio ocasional de vibráfono a piano acústico, sustituyendo al solista.
No hay percusión ni bajo independiente. La frase dura ocho compases y el
acorde cuatro; el reloj interno ocupa 48–66 BPM. Registros: fondo 43–62, teclas
57–69. Room 24/50, sin delay, dinámica estrecha. El saludo usa el bell tree común.

### Sleep

[Dickson y Schubert, análisis de piezas elegidas para dormir](https://journals.sagepub.com/doi/10.1177/1029864920972161)
encontraron diferencias a favor del legato, un registro principal menos agudo
y actividad rítmica baja o media; el tempo por sí solo no distinguió ambos
grupos. [Scarratt y otros, estudio de playlists](https://pmc.ncbi.nlm.nih.gov/articles/PMC9847986/)
encontraron música generalmente más suave y lenta, pero también varios
subgrupos distintos. En el [foro de ambient](https://www.reddit.com/r/ambientmusic/comments/1lv67x2)
se proponen armonías lentas, voces abiertas y conducción suave. Estas fuentes
orientan el diseño, sin prometer un efecto clínico.

Decisión: 60–72 BPM, cuatro tiempos, dos voces cálidas de registro medio
(49–66) y frases de piano espaciadas (59–69). Ataque y release del fondo 48/57,
room 24/50. El acorde dura cuatro compases y el centro tonal se revisa cada
ocho. Cada cuarto compás se abre un hueco en la voz alta; una persistencia
espectral amplia puede añadir un halo breve. La actividad modifica el acento
y la respuesta del piano, sin batería ni notas agudas repetitivas. El saludo
usa el bell tree común. El cambio de registro, nivel y ataque corrige la
salida anterior, casi imperceptible por grave y tenue.

### Psicodélico

[Ableton, bucles asíncronos y polirrítmicos](https://makingmusic.ableton.com/asynchronous-or-polyrhythmic-loops)
describe cómo células de distintas longitudes generan relaciones cambiantes
sobre un pulso compartido. También distingue esa técnica de bucles realmente
asíncronos. Se adopta la primera: tres y cinco posiciones que cambian de relación,
sin dar a cada onda su propio reloj ni perder el centro tonal.

Decisión: pedal de tónica/quinta durante 16 compases; 62–88 BPM; célula de dan tranh
y respuesta de vibráfono. Alturas estables del modo, no un acorde nuevo
por paquete. La anchura espectral habilita la segunda figura; el contorno
ponderado decide sentido y posición estéreo acotada a ±0,4. El bajo entra cada
cuatro compases. Un espectro muy ancho admite una textura ocasional, no continua.
El delay es el del DSP existente: wet 24, rate 57 (unos 543 ms), room 23/50;
chorus 18/4 sólo en pads. No se afirma sincronía de ese eco con el tempo ni se
simulan efectos inexistentes de cinta invertida. El saludo usa el bell tree común.

### Studio Ghibli

Un [análisis académico de «One Summer’s Day»](https://rsucon.rsu.ac.th/2021/paper/1923)
destaca la unidad por intervalos de cuarta, acordes suspendidos y extendidos,
pentatonismo y modo lidio, además de arpegios, bajo y transformación temática.
Un [compositor que analizó varias partituras](https://www.reddit.com/r/composer/comments/nll9fg/a_template_for_writing_ghibli_music/)
considera juntos ritmo, melodía, armonía y orquestación. La
[Sydney Symphony Orchestra](https://files.baskercdn.com/sydneysymphony/files/2025_SSP07_Art%20of%20the%20Score-The%20Music-of-Joe%20Hisaishi_web_singles.pdf)
describe la aparición de una melodía clara de piano entre la orquesta.
Son observaciones sobre obras concretas, no una receta universal.

La referencia concreta `inspiration/gibli-sound.mp3` dura 29,99 s (SHA-256
`18ae4d73bc272ba5daabeed9d19ab6b332ccb7b91f327993de462aa2fb01eff6`).
Su autocorrelación de ataques favorece 83,35 BPM (0,613); abundan intervalos
de ataque próximos a 0,36 y 0,72 s. Los parciales fuertes en F, G, A, C y E
ocupan especialmente el registro F5–C6. La grabación mezcla armónicos; esos
picos no constituyen una transcripción infalible. El análisis está en
`output/inspiration/ghibli-reference/analysis.json`.

Decisión revisada: tema original de ocho compases en tres tiempos, 79–86 BPM.
Tres rutas I–IV–ii–V, I–vi–IV–V e I–IV–V–I, con cambio cada dos compases.
Media, actividad y anchura espectral retenidas seleccionan la ruta; una
combinación de media y actividad altas de la primera ventana invierte el arco de la melodía entre
plantas. La mano izquierda toca una raíz y un apoyo interior ligero. La derecha
lleva una línea cantabile en registro 65–82 MIDI, con ascenso, respuesta,
desarrollo y cadencia. Los apoyos y finales de frase se resuelven en notas del
acorde; las ondas cortas alteran las notas de paso, la intensidad y la articulación.
El arreglo es de piano, con un máximo de tres voces simultáneas observado en
las pruebas. Se conservan silencios entre frases. Sala 10/50, sin eco ni chorus.
Ghibli usa ahora una variante del Steinway B con tres intensidades grabadas
(vl2/vl3/vl4) y muestras de liberación en su registro. El banco compacto de
una sola intensidad sigue sirviendo a los otros moods. Las muestras comprobadas
de C4, F♯4, C5 y E5 se mantienen a menos de 6 cents de su afinación esperada;
la sensación anterior de desafinación se debía más probablemente a notas de
paso acentuadas sobre acordes estables y al timbre uniforme del banco compacto.
No se reproduce la melodía del MP3 ni de una película.
El informe de la revisión está en
`output/mood-tests/2026-09-26T19-41-07-096Z-l1xrJx/report.md`:
cuatro grabaciones largas y seis comparaciones entre plantas pasan los criterios
aplicables. `suegra2.json` queda como datos insuficientes por duración.

### Calidad de las notas

El banco anterior sumaba izquierda y derecha antes de enviar cada muestra al
motor. En la muestra C4 del piano anterior, esa suma reducía la energía unos
3,1 dB y cancelaba parte del timbre estéreo; también afectaba a los demás instrumentos.
Ahora las muestras conservan sus canales en el DSP JavaScript y en el PCM
nativo. Los moods nativos usan ahora SFZ con muestras FLAC de Steinway B y VCSL.
El piano compacto conserva una grabación de intensidad media por nota y la
velocidad MIDI regula su nivel; no reproduce los cambios tímbricos entre capas
grabadas. El MP3 de referencia se usa para contrastar ritmo,
espectro y dinámica, no para copiar su melodía.

La transposición de muestras usa interpolación cúbica de cuatro puntos en los
dos motores. La ganancia final se aplica antes de un techo suave de 0,87;
antes se multiplicaba por 2,5 después del limitador, lo que podía volver a
recortar picos. La calibración fija sube Ghibli y Psicodélico 3,5 dB y Deep
focus 2,6 dB; mantiene Sleep y lofi, que ya tenían más nivel. En lofi el bajo
ahora aporta armónicos que pueden reproducir mejor los altavoces pequeños,
sin quitar su fundamental. Estas decisiones siguen dejando la dinámica de
cada planta en el arreglo, sin compresión automática que bombee.

Medición orientativa de la grabación `plantia-aaac7f46` con FFmpeg EBU R128
después de estos cambios y con MP3 a 48 kHz: Ghibli −23,2 LUFS,
Psicodélico −22,5, Deep focus −21,0, Sleep −16,5 y lofi −14,3.
Es nivel digital del render, no presión
acústica del teléfono. El nuevo test informa la fracción de muestras próximas
al techo PCM. Para valorar el altavoz real y la ruta Android es necesaria una
escucha de una compilación con el nuevo módulo nativo.

### Lección conservada del lofi

[Berklee, chord-tone frente a chord-scale soloing](https://www.berklee.edu/berklee-today/summer-2000/Chord-Tone)
distingue conocer las notas permitidas de construir una línea con sentido.
Todos los moods nuevos construyen primero un papel armónico y una frase:
la onda selecciona dentro de ellos. Repetir una nota puede ser musicalmente
correcto; no se fuerza un salto para aparentar variabilidad.

## Contrato de traducción común

| Dato | Escala / memoria | Decisión |
|---|---|---|
| Periodo medio absoluto | Logaritmo, 2–40 ms | Parte del tempo y elección entre centros Do/Re/Fa/Sol/La |
| Frecuencia geométrica ponderada | Logaritmo, 0,5–90 Hz del análisis | Parte del tempo y registro/timbre según mood |
| RMS del ajuste corto / media | Logaritmo, 0,0005–0,4 | Dinámica y respuesta de piano, acotadas en Sleep |
| Anchura espectral ponderada | Identidad retenida por sección | Ruta armónica o entrada de una respuesta |
| Persistencia de ondas | Seguimiento aproximado, no identidad biológica | Habilitación del halo de Sleep junto con anchura espectral |
| Fase/frecuencia/peso de todas las ondas cortas | Campo de 16 celdas retenido dos compases | Dirección del motivo o posición espacial |
| Pico extremo crudo | Referencia robusta, calentamiento y cooldown | Saludo separado del análisis Fourier |

La fórmula de tempo usa 70 % de coordenada de media y 30 % de frecuencia,
interpolados dentro del rango de cada mood. Sólo se mueve hasta 1 BPM cada dos
compases. Es un mapeo estético explícito; los Hz del sensor no se reproducen
como Hz de una nota. Los rangos logarítmicos proceden del trabajo previo de
lofi; no se afirma una nueva calibración de los cuatro moods sin ejecutarla.

Se conserva un análisis de identidad por sección y otro de motivo por dos
compases. Por tanto, un cambio real puede tardar en modificar una decisión
estructural: esto protege la coherencia. El arranque utiliza el análisis corto
completo, y se incorpora el largo en un límite armónico. No hay semillas
aleatorias ni decisiones por nombre, UUID o archivo de la planta.

Las amplitudes contribuyen al RMS y a los pesos; las fases al campo musical.
No todos los datos deben tener una salida audible independiente. Sleep limita
intencionadamente su variabilidad superficial; Psicodélico permite más.

En septiembre de 2026 se corrigió la transposición por clase de altura en
`WaveComposer`: el módulo negativo de JavaScript podía desplazar una nota
una octava hacia abajo incluso si ya pertenecía a la escala elegida. El log
de Android mostró notas de acompañamiento en MIDI 42–43 y bajo en 31; las
trazas corregidas sitúan el piano interior en 54–60 y el bajo en 38–48.

## Capas, colas y saludo

El planificador cuenta solapamientos también entre compases, incluida la caída
estimada por el DSP, y reserva una voz para el saludo. Límites de los nuevos
moods: Deep focus 6, Sleep 6, Psicodélico 7 y Ghibli 6. No incluyen las colas de
reverberación como nuevas voces. Un compás sin ataques no corta un pad sostenido;
una desconexión o análisis obsoleto sí retira el audio. El detector, cooldown,
canal y timbre del saludo son comunes; el tempo elige entre cinco tomas de bell tree.

El sonido sigue pasando por el banco de muestras, el DSP y el transporte PCM
nativo existentes. Se reutiliza esa infraestructura; no la lógica compositiva
antigua. Las descripciones en vivo muestran las fuentes, capas y reglas del mood.

## Archivos y migración

- `src/lib/wave-music/moods/shared.ts`: coordenadas, memoria por frase, admisión de voces.
- Un archivo por mood: `deep-focus.ts`, `sleep.ts`, `psychedelic.ts`, `ghibli.ts`.
- `lofi.ts` y sus reglas conservan el piano con motivo resuelto aprobado.
- `registry.ts` es la única lista de moods; `sonora/focus.ts` sólo expone sus perfiles.
- `sonora/orchestration.ts` conserva el contrato de buses y el acceso a la configuración; no contiene otro orquestador.
- `sonora/signal.ts` conserva el contrato de paquetes y constantes; no contiene otro analizador musical.
- Configuración antigua `lofi` migra a `lofi-waves`; IDs retirados o desconocidos vuelven a Deep focus.
- Retirados Marea/Nácar, presets dedicados, assets de Nácar y su generador.
- Eliminado el bundle worklet antiguo que ya no importaba la reproducción móvil.
  El índice móvil `sample-assets.ts` y su generador `sonora:build` se han retirado.
- Las herramientas de reproducción offline consumen paquetes crudos y WaveComposer.
  Se mantienen las grabaciones y las muestras históricas de evaluación del lofi.
