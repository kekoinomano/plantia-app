# Moods sobre ondas: diseño, investigación y límites

Estado: integración de código, sin tests, builds ni renders en esta revisión,
por petición del usuario. Lofi conserva el piano con motivo resuelto elegido.
Los cuatro moods nuevos necesitan valoración auditiva; no se presentan como
acústicamente validados ni calibrados con todas las capturas.

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
un cambio ocasional de piano eléctrico a acústico, sustituyendo al solista.
No hay percusión ni bajo independiente. La frase dura ocho compases y el
acorde cuatro; el reloj interno ocupa 48–66 BPM. Registros: fondo 43–62, teclas
57–69. Room 24/50, sin delay, dinámica estrecha. Saludo: una tecla afinada.

### Sleep

[Sleep Foundation, música y sueño](https://www.sleepfoundation.org/noise-and-sleep/music)
resume estudios que suelen utilizar música de 60–80 BPM y subraya que no existe
un género óptimo universal: importan las preferencias personales. No se deduce
que un BPM concreto induzca sueño. El tempo de un pad sin ataques regulares
es además un reloj de organización, no necesariamente un pulso perceptible.

Decisión: 60–72 BPM internos, unidades de ocho tiempos, dos voces cálidas sin
percusión ni solista percutido. El acorde dura ocho unidades; identidad cada
16, con promoción del primer análisis corto en el siguiente límite armónico.
Ataque 98 y release 82 (parámetros del DSP, no milisegundos); room 30/65.
El halo aparece como máximo una vez cada cuatro unidades cuando las ondas han
persistido. La actividad sólo cambia unos puntos de velocidad: nunca convierte
el fondo en una batería. Registros principales 43–62; halo 55–64.
El saludo es una elevación suave del halo, con ataque lento y sin golpe agudo.
No se hacen promesas médicas ni se implementan frecuencias “curativas”.

### Psicodélico

[Ableton, bucles asíncronos y polirrítmicos](https://makingmusic.ableton.com/asynchronous-or-polyrhythmic-loops)
describe cómo células de distintas longitudes generan relaciones cambiantes
sobre un pulso compartido. También distingue esa técnica de bucles realmente
asíncronos. Se adopta la primera: tres y cinco posiciones que cambian de relación,
sin dar a cada onda su propio reloj ni perder el centro tonal.

Decisión: pedal de tónica/quinta durante 16 compases; 62–88 BPM; célula de sitar
y respuesta de piano eléctrico. Alturas estables del modo, no un acorde nuevo
por paquete. La anchura espectral habilita la segunda figura; el contorno
ponderado decide sentido y posición estéreo acotada a ±0,4. El bajo entra cada
cuatro compases. Un espectro muy ancho admite una textura ocasional, no continua.
El delay es el del DSP existente: wet 24, rate 57 (unos 543 ms), room 23/50;
chorus 18/4 sólo en pads. No se afirma sincronía de ese eco con el tempo ni se
simulan efectos inexistentes de cinta invertida. Saludo: una nota de sitar.

### Studio Ghibli

La [biografía oficial de Joe Hisaishi](https://joehisaishi.com/biography/)
sitúa sus raíces en la música contemporánea y minimalista.
[Deutsche Grammophon](https://www.deutschegrammophon.com/en/artists/joe-hisaishi/news/joe-hisaishi-signs-to-deutsche-grammophon-and-announces-his-first-dg-album-a-symphonic-celebration-269355)
relaciona sus miniaturas de piano con ese interés y con el color instrumental.
Esto orienta la economía de motivos y los relevos tímbricos; no establece una
fórmula universal de “música Ghibli”. El tres por cuatro y las rutas de acordes
siguientes son elecciones nuestras, no conclusiones literales de esas fuentes.

Decisión: miniatura original de ocho compases en tres tiempos, 76–108 BPM,
con acordes cada dos compases. Dos rutas diatónicas: I–vi–IV–V o I–IV–ii–V.
Raíz de bajo en el primer tiempo, voces internas de piano en segundo/tercero.
La melodía de tercera/quinta crea pregunta y resolución; la flauta toma su
lugar en la respuesta si hay anchura espectral suficiente. El octavo compás
termina en una nota del acorde y deja respirar. No se apilan ambos solistas.
Piano 60–76, acompañamiento 48–62, bajo 36–48; room 18/50, sin chorus ni eco.
Saludo: pequeña llamada de dos notas de piano. No se citan temas de películas.

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
| RMS del ajuste corto / media | Logaritmo, 0,0005–0,4 | Dinámica, con margen muy estrecho en Sleep |
| Anchura espectral ponderada | Identidad retenida por sección | Ruta armónica o entrada de una respuesta |
| Persistencia de ondas | Seguimiento aproximado, no identidad biológica | Habilitación del halo de Sleep |
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

## Capas, colas y saludo

El planificador cuenta solapamientos también entre compases, incluida la caída
estimada por el DSP, y reserva una voz para el saludo. Límites de los nuevos
moods: Deep focus 6, Sleep 5, Psicodélico 7 y Ghibli 5. No incluyen las colas de
reverberación como nuevas voces. Un compás sin ataques no corta un pad sostenido;
una desconexión o análisis obsoleto sí retira el audio. El detector de saludo y
su cooldown son comunes, pero cada mood define timbre, altura, envolvente y nivel.

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
  `sonora:build` queda como generador del índice de muestras; no se ha ejecutado.
- Las herramientas de reproducción offline consumen paquetes crudos y WaveComposer.
  Se mantienen las grabaciones y las muestras históricas de evaluación del lofi.
