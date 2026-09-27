# Space: mood creado desde `inspiration/space.mp3`

## Evidencia de la semilla

Referencia: 32,86 s, SHA-256 `e29cc782934e75bb0159d7e63edab13e26b11d9f15219c7b6a4c3ae6008dae92`. El análisis reproducible está en `scripts/analyze-inspiration.py`; su salida de esta ejecución está en `output/inspiration/space/analysis.json`.

- La música entra cerca de 3,4 s; antes hay audio a unos −65 dBFS que no se convierte en una regla de silencio musical.
- El 81,6 % de la energía espectral queda en la componente armónica de HPSS con margen 3, frente al 0,10 % transitorio. Esto indica una textura mayormente sostenida, no una identificación de instrumentos.
- Los picos destacados corresponden aproximadamente a F, G, A, C y D en varios registros. Se adopta un vocabulario pentatónico relativo; la mezcla no demuestra una tonalidad única ni permite transcribir acordes completos con seguridad.
- El registro tonal fuerte se concentra entre 120 y 1200 Hz; el centroide medio es 921 Hz. Hacia 16 s y 24 s cambian las notas graves y aumenta de nuevo el contenido alto.
- Las autocorrelaciones de ataque para 152, 112, 65 y 56 BPM son todas débiles (≤0,10). El compás y los 58–72 BPM del mood son una elección de composición, no una medición fiable del MP3.

La inferencia instrumental y perceptiva es limitada: no se realizó una escucha directa en esta sesión. El análisis de parciales, HPSS y cromas no separa fuentes ni identifica timbres con certeza.

## Gramática original

El mood extiende el campo sostenido del fragmento a una forma generativa de doce compases. `space-time` toca una raíz larga y añade después un color del acorde; el fondo ya no repite dos ataques seguidos en cada ciclo. Vibráfono y strumstick alternan como voces principales con niveles similares. `liquid-nebula` abre brevemente el registro en puntos de la forma. El último compás retira el primer plano. El chorus lento queda en el fondo; las voces protagonistas tienen ataques claros, sin delay.

La investigación sobre ambient apoya empezar por una estructura armónica y dejar que el patrón aparezca después; Steve Hauschildt describe ese orden en su [entrevista sobre composición y síntesis](https://www.musicradar.com/artists/i-learned-synthesis-using-the-micromoog-so-ive-always-had-an-appreciation-for-those-kinds-of-synths-ambient-maestro-steve-hauschildt-on-the-obscure-plugins-generative-tools-and-00s-digital-synths-behind-aeropsia). La [guía de diseño de drones de MusicRadar](https://www.musicradar.com/news/ambient-sound-design) recomienda movimiento tímbrico lento y capas con funciones diferenciadas. Esos principios motivan el arreglo; no atribuyen al MP3 un equipo ni un efecto concreto.

## Respuesta de la planta

| Dato | Decisión musical | Límite |
| --- | --- | --- |
| Media y frecuencia de la ventana larga | Centro tonal y objetivo de tempo | Grados del modo y 58–72 BPM |
| Media y actividad de la primera ventana disponible | Familia de motivo: cuatro ritmos, contornos y registros diferenciados | Se retiene durante la sesión; nota dentro de la pentatónica |
| Anchura y actividad de la ventana larga | Recorrido de acordes y apertura de nube | Acorde durante doce compases; sin acordes extraños |
| Persistencia larga | Pulso grave de cierre y último reflejo | No añade capas continuamente |
| Suma ponderada de ondas cortas | Dirección, acento, nota y posición de cada voz principal | Notas dentro de la escala y huecos entre frases |
| Cambio grande entre ventanas largas | Nueva escena y posible centro tonal | En límite de frase; el fondo permanece continuo |

Las frecuencias del sensor describen fluctuaciones de los periodos del circuito; no se interpretan como alturas audibles ni estados biológicos. Los pesos de las ondas se conservan en la traza de decisiones del test.

## Verificación

`npm run typecheck` y `npm run moods:test -- --mood space`. Informe final: `output/mood-tests/2026-09-26T19-41-44-109Z-eV1OWs/report.md`. Pasan todos los criterios aplicables en las cuatro grabaciones largas y las seis comparaciones entre ellas. Los MP3 se generan con Sonora C++ y los SFZ/FLAC de la app. Ninguno muestra saturación sostenida. `suegra2.json` es demasiado corto para tres bloques de cuatro compases, de modo que su resultado temporal es `INSUFFICIENT`; no se prolonga artificialmente. La inspección espectral y las métricas no sustituyen una escucha perceptiva.
