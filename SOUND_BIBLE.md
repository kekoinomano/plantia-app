# Plantia · Biblia del sonido y los moods

Estado documentado: 9 de septiembre de 2026. Describe la implementación actual,
no una promesa de calidad musical ni una validación auditiva. Si cambian las
reglas, actualizar este documento en el mismo cambio. El código es la fuente
de verdad para constantes y comportamiento ejecutable.

## Índice

1. [Idea y reglas de oro](#1-idea-y-reglas-de-oro)
2. [Arquitectura y responsabilidades](#2-arquitectura-y-responsabilidades)
3. [De paquetes a señal musical](#3-de-paquetes-a-señal-musical)
4. [Escalas, octavas y sonidos](#4-escalas-octavas-y-sonidos)
5. [Orgánico](#5-orgánico)
6. [Motor compartido de Bruma y Sotobosque](#6-motor-compartido-de-bruma-y-sotobosque)
7. [Bruma](#7-bruma)
8. [Sotobosque](#8-sotobosque)
9. [Expresión, timbre, efectos y volumen](#9-expresión-timbre-efectos-y-volumen)
10. [Saludo y preescucha](#10-saludo-y-preescucha)
11. [Reloj, memoria y cambios de configuración](#11-reloj-memoria-y-cambios-de-configuración)
12. [Límites actuales que no debemos ocultar](#12-límites-actuales-que-no-debemos-ocultar)
13. [Cómo crear o modificar un mood](#13-cómo-crear-o-modificar-un-mood)
14. [Guía para agentes y mantenimiento](#14-guía-para-agentes-y-mantenimiento)

## 1. Idea y reglas de oro

Un **mood es un director de orquesta**: define qué huecos de sonido hay, qué
familias admiten y qué estrategia transforma la señal en acontecimientos musicales.
Un **preset es un sonido**: define su fuente, escala, registro y ajustes iniciales.
Una **nota es una decisión concreta**: qué altura/golpe, cuándo, cuánto tiempo,
con qué intensidad y articulación. No confundir estas tres capas.

Buscamos música que tenga memoria y evolucione, no un pitido que copie cada valor
ni una canción prefabricada que ignore la planta.

- La señal real debe justificar la identidad: nivel, cadencia, variación y forma.
- El reloj puede desarrollar un motivo entre paquetes, pero no inventar lecturas.
- Equilibrar repetición reconocible y variación: pregunta, respuesta, reposo.
- Mantener independientes las escalas de cada sonido. No imponer una escala común.
- Respetar las notas/octavas elegidas para la música normal. El saludo de Orgánico
  tiene una excepción de registro, explicada más adelante.
- Separar los ajustes guardados del usuario de las modificaciones transitorias.
- No activar efectos apagados como parte de la expresión. El saludo sí usa su
  propia cadena explícita de efectos.
- Un silencio compositivo significa no disparar notas; no garantiza silencio
  acústico si siguen vibrando muestras, releases o reverberaciones.
- No atribuir emociones ni especies a los datos: la personalidad es una traducción
  artística de la señal recibida, no una interpretación biológica validada.

## 2. Arquitectura y responsabilidades

```text
Paquetes reales → signal.ts → Frame → intent.ts → MusicalIntent
                                                   ├→ reglas del mood → notas/releases
                                                   └→ modulation.ts → expresión
                                                                ↓
                                Composer + reloj → DSP por slots → mezcla → audio
```

| Archivo | Responsabilidad |
| --- | --- |
| [signal.ts](src/lib/sonora/signal.ts) | Validar/agrupar datos y describir su forma. |
| [intent.ts](src/lib/sonora/intent.ts) | Convertir descriptores en carácter e intención, con memoria. |
| [moods.ts](src/lib/sonora/moods.ts) | Catálogo de moods, slots, familias y límites de expresión. |
| [presets.ts](src/lib/sonora/presets.ts) | Fuentes, ajustes, validación, escalas y `notePool`. |
| [composer.ts](src/lib/sonora/composer.ts) | Orquestación, reloj, ciclo de vida, IDs y distribución de eventos. |
| [rules/index.ts](src/lib/sonora/rules/index.ts) | Contrato `MusicalRules` y registro de estrategias. |
| [rules/organic.ts](src/lib/sonora/rules/organic.ts) | Motivos y capas de Orgánico. |
| [rules/ensemble.ts](src/lib/sonora/rules/ensemble.ts) | Frases por slot de Bruma y Sotobosque. |
| [modulation.ts](src/lib/sonora/modulation.ts) | Expresión continua acotada. |
| [synth-voices.ts](src/lib/sonora/synth-voices.ts) | Diseños tímbricos de los sintetizadores. |
| [dsp.ts](src/lib/sonora/dsp.ts) | Preparación de voces y DSP de referencia JavaScript. |
| [Sonora.h](modules/plantia-pcm/cpp/Sonora.h) | DSP nativo C++; mantener equivalente al JS cuando se modifica audio. |
| [native-pcm.ts](src/lib/audio/native-pcm.ts) | Traducción del protocolo de eventos al motor nativo. |
| [gesture.ts](src/lib/sonora/gesture.ts) | Detector de excursiones de señal que pueden disparar saludo. |

Cada slot tiene ID estable, tipo `synth`/`instrument`, patch, nivel y, para synth,
movimiento. `family` distingue viento, percusión, cuerdas, teclas, voz y ambiente.
`slot` identifica el canal concreto; `lane` identifica el tipo de sonido. No usar
`lane` como identidad cuando hay dos instrumentos.

`Configuration.slots` es la representación canónica. Los campos antiguos
`synth`/`instrument` son vistas del primer slot de cada tipo para compatibilidad
con Orgánico; no son dos sonidos adicionales.

| Mood | Estrategia | Slots y valores iniciales |
| --- | --- | --- |
| Orgánico (`organic`) | `OrganicRules` | `atmosphere`: Healing 55%; `melody`: Harp 95%. |
| Bruma (`mist`) | `EnsembleRules('mist')` | `cloud`: Enlightenment 80%. |
| Sotobosque (`grove`) | `EnsembleRules('grove')` | `ground`: Meditation 35%; `pulse`: Congas 80%, solo percusión; `breath`: Pan Flute 80%, solo viento. |

Los nuevos vientos están disponibles en el selector; no sustituyen automáticamente
Pan Flute como valor inicial. Los slots son fijos por definición de mood: no existe
todavía un sistema genérico de slots opcionales o de añadir/eliminar slots en vivo.

## 3. De paquetes a señal musical

### 3.1 Descripción del paquete

El acumulador espera diez valores finitos por paquete, secuencia creciente y
tiempo válido no decreciente. Los paquetes inválidos se descartan. Agrupa en
ventanas de 250 ms; el contenido se entrega cuando se vacía la ventana. No significa
que se generen cuatro mediciones por segundo cuando no hay datos.

Para cada valor `x` se aplica `sign(x) × log2(1 + abs(x))`. Esto comprime amplitudes
enormes sin borrar signo ni nivel absoluto. Después:

| Campo de `Frame` | Significado real |
| --- | --- |
| `time`, `seq` | Tiempo y secuencia de origen. |
| `level` | Media de valores crudos; no es el `character.level` musical. |
| `center` | Mediana de los valores comprimidos. |
| `profile` | Diez residuos: `tanh((valorComprimido-center)×2)/2`. Conservan el orden. |
| `spread` | RMS de los residuos; dispersión interna. |
| `roughness` | Media de diferencias absolutas entre residuos consecutivos. |
| `slope` | Media de residuos ponderados por posición de −1 a +1. |
| `spectrum` | Nueve magnitudes DCT de los residuos ordenados. |
| `cadence` | Separación entre paquetes reales, en segundos; se promedia al agrupar. |

La DCT describe la forma del paquete. **Sus bandas no son frecuencias calibradas
en Hz**, ni `slope` es directamente una derivada temporal. Al agrupar se promedian
descriptores/perfiles; `center` usa la mediana y tiempo/secuencia los del último
paquete del grupo.

### 3.2 Carácter y reacción inmediata

Notación: `clamp(x)` limita a 0…1; `tanh` comprime a −1…1. `Δ` es el cambio de
`center` entre frames; `dt` su separación en segundos.

El carácter se suaviza con `a = 1-exp(-dt/4)`; en el primer frame se toma la medida
directamente. Así no cambia toda la identidad a cada lectura:

```text
level     = clamp((center + 2) / 24)
pace      = 1 / (1 + max(0.001, cadence) / 0.12)     # alto = rápido
variation = abs(Δ) / (abs(Δ) + dt × 0.12)
texture   = spread / (spread + 0.08)
```

Otros descriptores son inmediatos:

- `profileScale = max(0.004, spread)` evita dividir por cero y exagerar ruido mínimo.
- `motion = 1-exp(-abs(Δ)×24-roughness×8)`.
- `detail = 1-exp(-spread×18)`.
- `bands[j] = sqrt(spectrum[j]/max(0.0001,sum(spectrum)))`.
- `shape`: centro de gravedad DCT, índices 1…9 divididos entre 9; cero sin energía.
- La línea base de `center` se suaviza con constante de tres segundos.
- `contour = tanh((center-baseline)×60+slope×35)` combina cambio temporal y forma.
- `position = clamp(0.1+level×0.65+(pace-0.5)×0.24+(shape-0.5)×0.22, 0.12, 0.88)`.

### 3.3 Huella adicional de los ensembles

Bruma y Sotobosque usan también `fingerprint`:

```text
cadence = clamp(log(1+max(0,cadenciaSegundos)×20) / log(121))
jitter = abs(cadenciaActual-cadenciaAnterior) /
         max(0.05,cadenciaActual+cadenciaAnterior)
```

Esta `cadence` significa **alto = lento**, al contrario de `character.pace`.
Cadencia e irregularidad se suavizan con la misma constante de cuatro segundos.
La escala logarítmica diferencia mejor paquetes cada 0.1, 1 o 5 segundos.

- `entropy`: `-sum(p×log(p))/log(9)`, con `p` las magnitudes DCT normalizadas y
  el suelo de energía anterior. Mide cuánto se reparte la forma entre componentes;
  con energía diminuta no interpretar el número como entropía ideal calibrada.
- `asymmetry`: centro de masa de `abs(profile)` sobre posiciones −1…1; cero sin
  energía. Distingue concentración al principio o al final del paquete.
- `novelty`: cambio de centro normalizado, peso 0.55, más distancia absoluta entre
  distribuciones DCT consecutivas, peso 0.225; resultado limitado a 0…1.
- Estos tres últimos no tienen el suavizado adicional del carácter.

No se usa el nombre Bluetooth, especie, identidad persistente o semilla aleatoria
para crear esta huella. Dos plantas con descriptores parecidos pueden sonar parecido.

## 4. Escalas, octavas y sonidos

`Patch.notes` contiene clases de altura 0…11 (`0=C`, `1=C#`…). El nombre de escala
es una etiqueta/selección; la lista efectiva es `notes`. `notePool` construye:

```text
para cada octava o entre mínimo y máximo, ambos incluidos:
    para cada clase n permitida: MIDI = 12 × (o + 1) + n
```

Ejemplo: pentatónica mayor `[0,2,4,7,9]`, octava 3 → MIDI `[48,50,52,55,57]`.
Con 3–4 se añade `[60,62,64,67,69]`. MIDI 60 es C4. Los controles 1…6 son
**octavas**, no escalas ni niveles de complejidad.

Un desplazamiento de dos posiciones en el pool significa dos notas permitidas,
no necesariamente dos semitonos. Cambiar 1–6 a 1–5 cambia la longitud del pool y,
por tanto, las alturas que resultan de mapear una posición porcentual: puede mover
la melodía aunque antes no se estuviera tocando la última octava.

Los instrumentos muestreados eligen la muestra más cercana y cambian su velocidad
de reproducción. Transponer cambia altura, duración y color de la muestra; no hay
time-stretch que conserve duración. Un registro muy grave puede resultar poco
audible en un altavoz móvil y una transposición extrema puede perder naturalidad.

Excepción: `Preset.percussion` lista golpes sin afinación (bongos, congas,
timbales, maracas). Su pool son IDs de golpes originales y no se transponen.
Taiko, timpani y kalimba sí son afinados aunque pertenezcan a percusión.

El catálogo completo de escalas, presets y ajustes está en `presets.ts`; evitar
copiarlo entero aquí para no mantener dos catálogos contradictorios. Añadir presets
al final conserva los índices `flavor` de los anteriores.

## 5. Orgánico

Intención: melodía protagonista con memoria breve, sobre capas de synth suaves.
No comparte el nuevo planificador de ensembles.

### 5.1 Instrumento: motivo de cuatro pasos

Al comenzar:

1. Se guarda `anchor = position`.
2. Se toman posiciones `[0,2,5,8]` del perfil y se traducen en cuatro desplazamientos
   de escala. La amplitud depende de `texture`; una función seno modulada por
   `pace` y `variation` añade contorno determinista.
3. Otras posiciones `[1,3,6,9]` eligen cuatro duraciones relativas de la lista
   `[0.75,1,1.5,2]`.

En cada nota, el centro es `round(anchor×(pool.length-1))`. Se añade el paso del
motivo, una diferencia viva entre dos posiciones del perfil (hasta ±2 grados) y
un pequeño aporte de `contour`. Si se repite la nota anterior fuera del inicio,
se intenta un vecino. El salto se limita a tres posiciones del pool.

```text
beat = (0.38 + (1-pace)×0.85 + (1-variation)×0.2) / speed
spacing = beat × ritmoDelPaso
```

`duration` varía con otra posición del perfil, aproximadamente 55–105% de
`spacing`; en el cuarto paso es 130%. Se limita a `0.3/speed … 4.5/speed`.
El cuarto paso tiene intensidad ×0.8; el primero ×1 y los intermedios ×0.9.

Tras el cuarto paso se espera al menos su duración y se añade un descanso de
`beat×(0.65+(1-variation)×1.6)`. En el segundo paso puede haber otro descanso si
la diferencia viva es negativa, más largo para señales lentas.

Al cerrar la frase solo una de las tres primeras celdas del motivo cambia un grado
hacia una nueva medida; se renueva su ritmo. El cuarto desplazamiento permanece.
`anchor` recorre un 25% del camino hacia la posición actual. Esto conserva identidad
y evita que cada lectura destruya la frase.

### 5.2 Synth: capas alternas

El diseño de `synth-voices.ts` participa aquí también en la composición:
`register`, `range`, `trace` y `pace` cambian cómo se lee la señal. No todos los
presets synth generan exactamente la misma secuencia incluso con igual escala.

Se calcula una traza ponderada del perfil y un registro objetivo con nivel,
forma DCT, variación y contorno. El registro se limita a 0.12…0.72 y se acerca
al objetivo con factor `0.22-(stability/100)×0.16` en cada renovación.
La altura objetivo añade una posición del perfil, cadencia y `sin(center×0.73)×3`.
Se busca la nota permitida más cercana y se limita el cambio de raíz a dos
posiciones del pool por renovación.

Un compañero se busca cerca de un intervalo de 7, 4, 3 o 5 semitonos, elegido por
el perfil. Si no cabe por arriba, se busca por abajo. Se cuantiza al pool; no es
una garantía de que el intervalo final sea exactamente el solicitado.

```text
period = (1.8 + stabilityNormalizada×1.8 + (1-pace)×2 + (1-variation))
         × (0.78 + diseño.pace×0.08) / speed
fade = min(period×0.65, transition/speed)
```

Una renovación toca raíz y la siguiente compañero, no ambos simultáneamente.
Cada nota dura `period×1.25` antes del release, de modo que se solapan. Las
intensidades son ×0.5 y ×0.34, paneadas a −0.22/+0.22. No se desliza continuamente
la frecuencia de una nota a otra: el fundido es de amplitud, no una sirena tonal.

## 6. Motor compartido de Bruma y Sotobosque

`EnsembleRules` mantiene mapas por slot: próxima ejecución, contador de pasos,
frase, acorde anterior y última altura melódica. No hay un compás global rígido
compartido por todos los slots.

### 6.1 Captura de frase

Los instrumentos renuevan su plan al alcanzar un múltiplo de la longitud anterior;
el synth cada cuatro renovaciones armónicas. Se captura:

```text
activity = clamp(variation×0.4 + (1-fingerprint.cadence)×0.4 + entropy×0.2)
length = asymmetry < -0.25 ? 12 : 16
home = round(clamp(0.5 + (level-0.5)×0.7×plantResponse
                      + (shape-0.5)×0.25×plantResponse, 0.12, 0.83) × (N-1))
spread = 1 + round(texture×3 + entropy×2)
pulses = round(3 + activity×(length/2-3))
rotation = round((asymmetry+1)×3 + shape×4)
swing = irregularity×0.2
beat = (0.26 + fingerprint.cadence×0.27) / speed
```

`N` es el tamaño del pool. `beat` es una **celda**, no necesariamente una negra
musical ni un BPM mostrado. A velocidad 1 dura 0.26…0.53 segundos.

El motivo contiene cinco desplazamientos: se alternan las posiciones pares/impares
del perfil entre generaciones y se calcula `round(tanh(valor/profileScale)×spread)`.
Si es la primera frase o `novelty>0.5`, se reemplaza entero. En caso contrario se
conservan sus dos primeros desplazamientos y se actualizan los otros tres.

La actividad/tempo/motivo capturados permanecen durante esa frase. La muestra
local del perfil y algunos matices sí siguen la última señal. No toda novedad se
guarda para después: el reemplazo consulta la novedad disponible en ese límite.

La intensidad base por celda es:

```text
sample = tanh(profile[(cell + slotIndex×3) mod 10] / profileScale)
velocity = clamp(centerVelocity + rangeVelocity×
                 ((activity-0.5)×0.45 + sample×0.2), 18, 120)
```

El orden de los slots influye en qué parte del perfil consulta cada uno.

### 6.2 Acordes compatibles con la escala del slot

`voicing` empieza por la raíz. Busca acompañantes a no más de 16 semitonos de
ella, separados al menos tres semitonos de todas las voces ya elegidas. Solo
acepta diferencias módulo 12 de `[0,3,4,5,7,8,9]`: unísono/octava, terceras,
cuarta/quinta y sextas. Evita segundos, séptimas y tritono simultáneos.

Entre candidatos prefiere cercanía a la voz correspondiente del acorde anterior;
sin historia busca raíz+7 y luego raíz+4. Si no hay candidatos, utiliza menos voces.
No inventa notas fuera del pool para completar una tríada. Es una heurística local
de conducción de voces, no una optimización global de inversiones ni armonía funcional.

## 7. Bruma

Intención: ambiente que abre y cierra nubes armónicas, con algún destello individual.

### 7.1 Ciclo armónico

Cada ciclo tiene cuatro renovaciones. Para `cycle=0,1,2`, el desplazamiento de
raíz es `motif[cycle] + direction×cycle`, con dirección −1 si `contour<0` y +1
en otro caso. En `cycle=3` vuelve a `home`. No es una progresión fija I–IV–V–I:
la ruta la define el perfil de la señal.

```text
period = beat × (9 + stability/25)
```

Hay dos voces, o tres cuando la entropía actual supera 0.45, siempre sujeto a
encontrar alturas compatibles. La entrada de la voz `j` se retrasa
`j×beat×(0.35+texture×0.7)`.

Todas las voces de una nube cierran su gate juntas: duración desde su propia
entrada = `period×0.92-delay`, salvo en el retorno, que usa `period×0.62-delay`.
Así el retorno deja más espacio antes de la nube siguiente. El release y los
efectos pueden seguir sonando durante ese espacio.

Raíz a intensidad base ×0.43; acompañantes ×0.3. Las voces se abren en estéreo
alrededor del centro con separaciones de 0.38. `fade=min(period×0.25,transition)`.

### 7.2 Destello de respuesta

Solo en la segunda renovación (`cycle=1`) y con actividad capturada >0.4:

- Aparece al 60% del periodo.
- Busca la nota permitida más cercana a raíz+12 si la asimetría es positiva;
  si no, a raíz+7.
- Dura `beat×1.8`, intensidad ×0.28 y fundido `beat×0.45`.
- El paneo viene de la muestra local del perfil.

Esto añade una respuesta sin convertir toda la nube en un arpegio continuo.

## 8. Sotobosque

Intención: percusión y viento con espacio mutuo sobre un fondo discreto.

### 8.1 Fondo

Usa el mismo ciclo de raíces y conducción de voces de Bruma, pero solicita dos
voces, periodo `beat×12` y no añade destellos. Conserva entradas escalonadas y
retornos abreviados. Actualmente `stability` no cambia este periodo; `transition`
sí entra en el fundido. El preset Meditation y nivel 35% son valores iniciales,
no un sonido impuesto para siempre.

### 8.2 Percusión

La función de distribución de golpes es:

```text
pulse(step,count,length,rotation) =
    móduloPositivo((step+rotation)×count,length) < count
```

Es una distribución modular regular con huecos, de inspiración euclídea, no un
algoritmo que genere cualquier patrón tradicional. Por ejemplo, 3 golpes en
8 celdas con rotación cero producen `X..X..X.`.

Se usan `pulses`, `length` y `rotation` de la frase. Con actividad >0.55 se añaden
golpes fantasma cuando una segunda distribución de dos golpes en siete celdas
está activa y no coincide con un golpe principal. Su rotación cambia con la
generación. Esa célula de siete se evalúa sobre `cell` y se reinicia con la frase;
no es un segundo reloj independiente permanente.

En generaciones impares las dos últimas celdas son descanso, incluso si habría
golpe. En las demás generaciones puede haber golpes al final.

La selección de nota/golpe combina `home`, motivo y muestra local ×2. Los fantasmas
tienen intensidad ×0.4 y duración `beat×0.35`; los principales duran `beat×0.8`,
con intensidad ×1 en celdas múltiplo de cuatro y ×0.77 en el resto.

La duración entre celdas alterna `beat×(1+swing)` y `beat×(1-swing)`:
la irregularidad añade balanceo sin introducir azar. La percusión queda hacia
la izquierda con pequeñas variaciones del perfil.

### 8.3 Viento / rama melódica

La rama se aplica a instrumentos que no son familia percusión. Distribuye
`round(3+activity×3)` entradas, de tres a seis, sobre `length-2` celdas, con
rotación `rotation+2`. Las dos últimas celdas no disparan notas.

Primera mitad: pregunta. Segunda mitad: respuesta que recorre índices del motivo
en sentido inverso; además invierte sus desplazamientos si el contorno es negativo.
En las cuatro últimas celdas el objetivo pasa a `home`. Solo se oye resolución
si hay una entrada en esa zona: no se fuerza una nota final extra.

Se busca una nota permitida a no más de siete semitonos de la anterior. Esto puede
hacer que una vuelta a `home` sea gradual, no exacta al primer intento.

Se cuenta el espacio hasta la siguiente entrada o el descanso final. Duración:

```text
legato = muestraLocal > 0 o estamos en las cuatro últimas celdas
duration = beat × min(espacio × (legato ? 0.86 : 0.48), 3)
```

La pregunta usa intensidad ×0.96 y la respuesta ×0.86. El viento queda a la derecha,
con asimetría modulando su posición. Usa el mismo balanceo temporal de la percusión,
pero cada slot guarda sus propios vencimientos y planes.

Un ornamento vecino puede aparecer si `novelty>0.55`, hay al menos dos celdas de
espacio y la celda es múltiplo de cuatro: entra a `beat×0.65`, dura `beat×0.4`
y tiene intensidad ×0.48. Puede solaparse con la nota principal.

### 8.4 Articulación transitoria

Si la envolvente está activada, cada nota usa una copia del patch:

```text
attack = ataqueUsuario × articulación
release = min(releaseUsuario, 12 + articulación×20)
```

Articulación: percusión 0.25, viento corto 0.3, viento ligado 0.8, ornamento 0.15.
Son valores de control 0…100, no segundos. Reducen las colas de notas para que los
huecos no se llenen siempre. Si la envolvente está apagada, no se modifica ni activa.
Actualmente esta articulación no se multiplica por `plantResponse`.

## 9. Expresión, timbre, efectos y volumen

### 9.1 Qué cambia realmente la planta

Además de notas discretas, cada frame real emite una `Expression`. Es global para
la escena, aunque cada slot la oye a través de su propio sonido y bus de efectos.
No existen aún expresiones continuas diferentes por slot.

| Campo | Destino audible |
| --- | --- |
| `brightness` | Pesos de armónicos y filtro del synth. |
| `energy` | Amplitud/movimiento tímbrico, desafinación leve y movimiento de chorus del synth. |
| `direction` | Matices de evolución y movimiento espacial del synth. |
| `bands` | Pesos de parciales según el diseño de synth. |
| `space` | Mezcla wet de delay/reverb de los slots normales; no cambia tiempos/feedback. |
| `smoothing` | Tiempo de acercamiento suave a los objetivos de expresión. |

Los instrumentos muestreados no se resintetizan con las bandas DCT: su personalidad
cambia principalmente por altura, transposición de muestra, articulación, intensidad,
paneo y efectos. No hay un filtro expresivo de muestras equivalente al del synth.

Para Orgánico:

```text
brilloMedido = texture×0.35 + level×0.2 + variation×0.25 + sum(bands[4..8])×0.08
energíaMedida = variation×0.4 + pace×0.3 + texture×0.3
espacioMedido = (variation-0.5)×2
```

Para Bruma y Sotobosque:

```text
brilloMedido = level×0.25 + shape×0.35 + entropy×0.4
energíaMedida = variation×0.4 + (1-cadenceLog)×0.35 + novelty×0.25
espacioMedido = clamp(1-cadenceLog-texture-irregularity×0.5, -1, 1)
```

Se limita la desviación del brillo respecto a 0.35 y de energía respecto a 0.3
al presupuesto del mood, y se multiplica por `plantResponse` (0…1). Dirección
también se multiplica por respuesta; las bandas se interpolan desde 0.33.

| Mood | Máxima desviación brillo | Energía | Espacio: puntos wet reverb | Suavizado |
| --- | ---: | ---: | ---: | ---: |
| Orgánico | 0.30 | 0.25 | ±8 | 0.4 s |
| Bruma | 0.40 | 0.30 | ±18 | 1.2 s |
| Sotobosque | 0.50 | 0.45 | ±22 | 0.5 s |

Delay recibe la mitad de los puntos de espacio. Todos los wet finales se limitan
a 0…100%. Un efecto apagado sigue sin mezclarse en la salida. No se reescribe la
configuración guardada ni se recargan muestras para aplicar estas modulaciones.

**Respuesta cero no significa música independiente de la planta**: neutraliza esta
expresión y el desplazamiento de `home` por nivel/forma en ensembles. Motivos,
actividad, ritmo y articulación siguen reaccionando. Orgánico no escala con ese
control su selección de notas. Este alcance debe conservarse o cambiarse explícitamente.

### 9.2 Cómo se fabrica el audio

Instrumentos: muestras MP3 decodificadas/normalizadas, reproducción afinada y
envolvente. Synth: suma de hasta ocho armónicos sobre tres osciladores ligeramente
desafinados, evolución de parciales, respiración y filtro paso bajo. Las familias
`silk`, `glass`, `choir`, `strings`, `reed`, `plume` tienen tratamientos distintos.
No asumir que todo campo de `SynthVoice` está usado: comprobar consumidores antes
de intentar cambiar música mediante `intervals`, `sustain` o `response`.

La duración de una nota marca el comienzo del release, no el fin del audio.
Para instrumento normal con envolvente activada:

```text
attackSegundos = 0.004 + 0.45 × (attack/100)²
releaseSegundos = 0.06 + 3.5 × (release/100)²
```

Sin envolvente: ataque 0.004 s y release 0.35 s. Synth con `fade` y envolvente:
ataque `0.35+fade×(0.35+attack/100×0.65)`, release
`0.6+fade×(0.5+release/100×0.8)`. Apagar la envolvente no elimina los pequeños
fundidos antichasquidos. La muestra puede acabarse antes del gate; no se alarga
automáticamente por pedir una nota más larga.

Delay usa tiempo `0.07+1.1×(1-rate/100)` segundos: mayor `rate` significa eco más
corto, no mayor feedback. Reverb usa feedback `0.48+amount/100×0.4`; chorus modifica
copias retrasadas. Consultar `Effects.process` para los detalles de mezcla.

Las ganancias iniciales de voz son 0.48 synth, 0.28 instrumento y 0.2 saludo,
multiplicadas por `(velocity/100)^1.15`. Luego actúan niveles por slot, efectos,
atenuación durante saludo y mezcla. La salida usa ganancia prelimitador 4.125 y
limitación suave `tanh` hasta ±0.9. No es normalización automática de todo sonido
al mismo volumen: un preset al 100% puede ser más discreto que otro.

Cada slot tiene presupuesto de voces: seis synth, ocho instrumento; saludo seis.
El máximo de escena es ocho slots de sonido más el bus `$greeting`. Añadir capas
sin considerar releases puede provocar sustitución de voces, no riqueza ilimitada.

## 10. Saludo y preescucha

### 10.1 Qué lo dispara

`gesture.ts` detecta una excursión coherente, no demuestra que alguien haya tocado
la planta. Usa seis segundos de historia, mediana local y ruido de pasos.
Umbral `max(0.13,ruido×9)`; exige calentamiento de 0.75 s y al menos tres segundos
desde el saludo anterior. Una lectura candidata necesita otra confirmación en
la misma dirección dentro de 1.5 s y conservando más del 30% del contraste.

Tras confirmar, espera dos lecturas de retorno cerca de la base o un máximo de
ocho segundos de evento activo antes de permitir otro. Separaciones >1.5 s
reinician la detección del gesto. **Esto no es el límite de seis segundos de
continuidad musical**: una planta con paquetes cada cinco segundos puede seguir
sonando, pero no confirmar normalmente este saludo entre esos paquetes.

### 10.2 Qué toca

Orgánico usa el instrumento seleccionado. En afinados busca una raíz próxima a
la última nota+5, objetivo limitado a MIDI 60…78. Conserva las clases de escala,
pero construye un pool de octavas **3…7**, fuera del rango normal si hace falta.
Busca dos notas superiores cerca de tercera/quinta penalizando intervalos tensos;
dispone de respaldo por octavas. Tres entradas a 0, 0.12 y 0.27 s; duraciones
0.7, 0.775 y 0.85 s; intensidades 72, 65 y 60. En percusión sin afinación usa
tres golpes originales, con variación basada en secuencia.

Ensembles eligen primero viento, después instrumento, después primer slot. Bruma
usa por tanto su synth. Toman el 60% del pool y notas dos/cuatro posiciones más
arriba, recortadas al final: pueden repetirse si el pool es pequeño. Entradas
0, 0.14 y 0.3 s, duración 0.8 s, intensidades 65, 58 y 51. **No hacen la búsqueda
de consonancia de Orgánico**: es una respuesta escalonada, no siempre una tríada.

El patch especial de saludo activa delay 12/92, reverb 18/20, chorus 12/18 y
envolvente ataque 0/release 10. La voz de saludo usa ataque 0.003 s y release
0.4 s específicos. El último gate+release ronda 1.5 s en ensembles; los efectos
pueden extender su cola. No prometer una duración total estricta de dos segundos.

La selección del patch de nota del saludo y la del bus no usan exactamente la
misma prioridad: `audioChannels` toma el primer instrumento o primer slot para
el bus, mientras `EnsembleRules.greet` prefiere viento. Los efectos especiales
son comunes hoy; revisar esta distinción antes de ampliar la personalización.

El saludo alternativo de campanillas de viento permanece comentado en
`organic.ts` y en el DSP. No está activo ni es un selector de interfaz.

### 10.3 Preescucha

`audition` usa un frame artificial solo para escuchar el sonido elegido; no forma
parte del análisis real de la planta. Orgánico preescucha una pareja synth o
tres notas de instrumento; ensembles una nota al 55% del pool, tres segundos
si synth y uno si instrumento. Una preescucha no representa la composición completa.

## 11. Reloj, memoria y cambios de configuración

- `push(frame)` actualiza intención y expresión una vez por frame real y permite
  ejecutar el siguiente paso musical. Ignora tiempos no crecientes.
- `advance(time)` desarrolla música con la última intención mientras sea reciente.
  No reanaliza el mismo paquete. Ejecuta como máximo el paso vencido por slot;
  no recupera retrasos disparando muchas notas juntas.
- Más de seis segundos sin frame provoca release y reinicio de reglas/intérprete.
  La cola acústica puede continuar; no equivale a desconectar físicamente Bluetooth.
- Cambiar de mood termina las reglas anteriores y crea otras. Composer mantiene
  IDs únicos de nota; la intención disponible permite empezar el nuevo mood.
- Cambiar patch en ensembles libera y reinicia la memoria del slot. Cambiar solo
  nivel no reinicia la frase. El tempo capturado no cambia hasta renovar el plan.
- Orgánico reinicia su estado synth cuando cambia su patch. Para instrumento
  reinicia vencimiento/última altura, no toda su memoria de motivo.
- La interfaz conserva ajustes por mood/slot/preset durante la sesión actual;
  no interpretar esa memoria como persistencia garantizada tras cerrar la app.
- Cambiar layout reinicia voces y buses de audio. Muestras de programas iguales
  se comparten; solo se decodifican los necesarios para los slots activos.

## 12. Límites actuales que no debemos ocultar

1. Consonancia local no garantiza consonancia de toda la escena: las escalas son
   independientes y los acordes sucesivos se pueden solapar durante releases.
2. «Resolución», «pregunta» y «suspensión» son funciones compositivas aproximadas,
   no análisis tonal formal ni una cadencia clásica garantizada.
3. Los slots ensemble tienen relojes propios. Cambios de cadencia o límites de
   frase distintos pueden separarlos; no hay sincronización exacta de compases.
4. Pasar de longitud 12 a 16 cambia el módulo del contador existente, no lo pone
   necesariamente a cero. Puede cambiar la fase percibida de la nueva frase.
5. La capa fantasma de siete celdas se reinicia con cada frase; el nombre comercial
   «polirritmos» no implica dos metrónomos independientes.
6. `fingerprint.novelty` compara el último par de frames, no acumula todos los
   acontecimientos hasta el siguiente compás. Los cambios breves pueden no renovar
   el motivo si desaparecen antes de la captura de frase.
7. La expresión de efectos es global, no específica por slot. Cambiar `note.patch`
   sí afecta a la preparación/envolvente de esa nota, pero no reconfigura por sí
   solo el bus de delay/reverb. Para efectos por slot hace falta diseñar ese camino.
8. `plantResponse` no es un interruptor de toda interacción. La articulación
   ensemble y buena parte de la composición siguen activas a cero.
9. La intensidad base ensemble tiene suelo 18 antes de multiplicadores, incluso
   con `velocity.center=0`. Para silenciar un slot usar su nivel, no ese parámetro.
10. Un slot a volumen cero puede seguir generando eventos. Un log de notas no
    demuestra que esas notas se estén oyendo.
11. Nivel comprimido y cuantización pueden hacer coincidir plantas diferentes;
    no hay identidad sonora persistida por dispositivo. Una señal plana conserva
    estructura musical del reloj: no produce variación biológica ficticia.
12. El saludo ensemble puede repetir notas y no usa la búsqueda armónica de
    Orgánico. El saludo de Orgánico es la excepción al rango de octavas del usuario.
13. `OrganicRules` es de dos roles heredados: no sirve sin adaptación como
    estrategia genérica de cuatro slots, aunque el catálogo permita describirlos.

Estas observaciones documentan el código; no autorizan a un agente a corregirlo
todo fuera del alcance del encargo.

## 13. Cómo crear o modificar un mood

### 13.1 Decidir primero su identidad

Completar esta ficha antes de tocar algoritmos:

```text
Nombre / intención audible:
Slots, roles, familias permitidas y presets iniciales:
Qué rasgos de señal distinguen plantas:
Qué cambia inmediatamente y qué se captura al comenzar frase:
Vocabulario: nota sola / acorde / respuesta / silencio / ornamento:
Memoria: qué se conserva, cómo se transforma y cuándo se reinicia:
Alturas: centro, recorrido, saltos, consonancia y resolución:
Ritmo: densidad, duración, acentos, descansos y sincronización:
Expresión: destinos reales, límites, suavizado y alcance de plantResponse:
Presupuesto de voces y colas:
Saludo y preescucha:
Qué NO debe hacer este mood:
```

Una regla musical debe poder explicar **qué dato la provoca y qué escucha el
usuario**. Ejemplo: «La irregularidad aumenta el swing hasta ±20%» es verificable
en el código; «la planta está contenta y quiere bailar» no lo es.

### 13.2 Reutilizar una estrategia

Añadir una entrada a `MOODS` con IDs estables, slots, valores iniciales y
presupuesto de modulación. Elegir una clave `rules` existente si se desea realmente
su mismo vocabulario. Cambiar solo presets no crea una estrategia musical nueva.
Respetar el límite de ocho slots y comprobar por lectura que cada preset inicial
pertenece a la familia admitida. No reutilizar Orgánico para layouts que no cubre.

En `EnsembleRules` la rama se selecciona por tipo/familia: synth → nube,
percusión → pulsos, resto de instrumentos → frase melódica. Un slot llamado
«bajo» no adquiere reglas de bajo por su nombre.

### 13.3 Crear otra estrategia

1. Crear `rules/<nombre>.ts` con `MusicalRules`: `configure`, `tick`, `greet`,
   `audition`, `finish` y `drain`.
2. Ampliar la unión de `Mood.rules` en `moods.ts` y registrar su fábrica en
   `rules/index.ts`. Registrar después el mood y sus slots.
3. Recibir `MusicalIntent`, no leer Bluetooth, UI o archivos desde las reglas.
4. Emitir `note`, `release` y usar `slot` estable. Composer asigna los IDs de nota.
   `time` es programación; `source` identifica el frame. Para código nuevo conservar
   `sourceTime` real como hace ensemble; Orgánico actualmente usa el tiempo del tick.
5. Definir comportamiento sin pool válido, con un único tono, con percusión sin
   afinación, sin datos recientes y al terminar. No completar acordes fuera de escala.
6. Delimitar memoria y crecimiento; no acumular listas de eventos para toda la sesión.
7. Si se necesita otra interpretación expresiva, hacer explícita la estrategia en
   `modulation.ts`: hoy cualquier regla que no sea `organic` usa la fórmula ensemble.
8. Si se necesita un destino de audio nuevo, implementarlo en tipos, adaptador
   nativo, DSP JS y C++. No añadir un control visual que ningún renderizador consume.

No hacen falta cambios de backend para una estrategia que solo emite notas y usa
la expresión disponible. Los cambios de síntesis o protocolos sí cruzan esa frontera.

### 13.4 Añadir instrumentos

Definir preset, programa/modelo y familia en `presets.ts`; rangos naturales y
efectos moderados ayudan más que cubrir seis octavas artificialmente. Si es
percusión no afinada, declarar sus golpes en `percussionHits`.

Para muestras: guardar archivos, entradas de manifest y atribución/licencia.
Los importadores de [percusión](scripts/import-percussion.mjs) y
[vientos](scripts/import-winds.mjs) fijan revisión, origen y hashes. Los cinco
vientos nuevos son aproximaciones FluidR3 GM CC-BY-3.0, no grabaciones de campo:
15 MP3, 368617 bytes en conjunto. Tres muestras por instrumento se transponen
para cubrir el resto de alturas. Mantener ese compromiso de tamaño explícito.

## 14. Guía para agentes y mantenimiento

### Contexto recomendado para un encargo

> Lee SOUND_BIBLE.md y después los archivos fuente de la estrategia afectada.
> Distingue reglas compositivas, presets y DSP. Conserva la relación con datos
> reales, la memoria musical, las escalas independientes y los ajustes del usuario.
> No conviertas limitaciones documentadas en capacidades supuestas. Modifica solo
> el alcance solicitado, explica qué rasgo de señal produce cada cambio y actualiza
> esta guía si alteras el comportamiento. No ejecutes tests, compilaciones ni crees
> archivos de prueba salvo que el encargo o las instrucciones aplicables lo pidan.

### Dónde tocar según el problema

| Problema | Primer lugar que estudiar |
| --- | --- |
| Plantas diferentes con notas demasiado parecidas | `signal.ts`, `intent.ts`, mapeo de registro/motivo de la estrategia. |
| Demasiada repetición | Memoria, renovación y transformación del motivo; no añadir azar sin justificación. |
| Pocos silencios | Planificador, gate, release y efectos; no solo disminuir el número de notas. |
| Synth como pitido | Armónicos/filtro/envolvente del diseño y densidad/registro de las reglas. |
| Instrumento irreconocible o débil | Muestra, transposición, ataque, ganancia y wet; no solo master. |
| Un control no parece hacer nada | Seguir su consumidor desde configuración hasta DSP, no fiarse del log CONFIG. |
| Nuevo mood con otros huecos | `moods.ts`, compatibilidad de estrategia y familias de presets. |

`NOTES` permite ver slot, MIDI, duración, motivo de decisión y paso cuando el
adaptador los registra. Razones típicas: `signal-motif`, `phrase-resolution`,
`signal-root-layer`, `mist-voiced-cloud`, `mist-cloud-answer`,
`grove-signal-pulse`, `grove-cross-rhythm-ghost`, `grove-motif-question`,
`grove-motif-answer`, `grove-motif-resolution`, `grove-signal-ornament`.
`CONFIG` muestra ajustes base, no cada variación expresiva efectiva. Un `peak`
agregado o `underruns=0` habla de salida/continuidad, no demuestra belleza musical
ni que cada efecto se oiga como se espera.

No editar a mano `src/lib/audio/sonora-runtime.ts` ni
`src/lib/audio/sample-assets.ts`: los genera `npm run sonora:build`. Después de
cambios ejecutables de Sonora o manifest hay que regenerarlos para integrar el
cambio; eso no es construir la APK ni una prueba auditiva. Un cambio solo de
documentación, como esta guía, no necesita esa ejecución.

Para cada modificación musical dejar anotado: reglas cambiadas, dato que las
alimenta, comportamiento esperado, límites y qué se ha validado realmente.
La lectura de código puede explicar el mecanismo; escuchar sigue siendo necesario
para decidir si el resultado gusta. No presentar una hipótesis sonora como algo oído.
