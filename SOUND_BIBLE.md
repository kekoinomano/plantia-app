# Lenguaje musical de saviasound

El diseño vigente, fuentes y reglas de los cinco moods está en
[docs/music/WAVE_MOODS.md](docs/music/WAVE_MOODS.md).

La música procede de las ventanas espectrales y las medias de la planta. Los
picos extraordinarios se detectan en crudo para el saludo. No queda un motor
paralelo de gestos ni selección de presets independiente de las reglas del mood.

- **Deep focus:** fondo pentatónico y teclas discretas en compases alternos.
- **Sleep:** continuidad de dos voces, halo ocasional, ataques lentos y sin percusión.
- **Lofi Ondas:** piano con pregunta y resolución, acompañamiento grave, bajo y groove.
- **Psicodélico:** pedal modal, células de tres/cinco y ecos limitados.
- **Studio Ghibli:** miniatura original en tres tiempos, piano y respuesta de madera.

Las ondas influyen dentro de una gramática musical. Sus pesos no son porcentajes
de volumen y no se asigna automáticamente un instrumento a cada onda.
Las reglas se encuentran en `src/lib/wave-music/moods/`, un archivo por mood;
`shared.ts` mantiene coordenadas, memoria y límites para los cuatro nuevos.
La infraestructura de audio reutilizable continúa en `src/lib/sonora`.

Lofi conserva la opción aprobada por escucha. Los otros cuatro moods están
implementados sin tests, builds ni nuevas exportaciones de audio, por indicación
del usuario. La documentación no implica validación auditiva o clínica.
