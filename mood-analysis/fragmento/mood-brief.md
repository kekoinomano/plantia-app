# Mood brief · fragmento

Generado automáticamente a partir de `fragmento.mp3`. Es un brief de inspiración, no una transcripción ni una afirmación musicológica.

## Firma de la referencia

- Duración: 29.99 s.
- Tempo detectado: 172.3 BPM; interpretación musical recomendada: **86.1 BPM** (se corrige el posible doble tiempo).
- Tonalidad candidata: **C major**. Alternativas: C major (0.83), C minor (0.56), F major (0.53).
- Clases de altura dominantes: C, E, F, B, G, D, C#.
- Hipótesis armónica por bloques: C → Gsus4 → C → Gsus4 → C → Fsus2 → F → Fsus2 → Gsus4 → C.
- Carácter: harmonicidad 0.89, 2.40 ataques/s, centro espectral 711 Hz, amplitud estéreo side/mid -7.1 dB.

## Separación de fuentes

| Stem Demucs | RMS frente a mezcla | Harmonicidad | Ataques/s | Registro P10 / P50 / P90 |
| --- | ---: | ---: | ---: | --- |
| bass | -11.3 dB | 0.99 | 0.90 | C2 / C2 / F2 |
| drums | -10.2 dB | 0.16 | 1.76 | — |
| guitar | -6.9 dB | 0.92 | 0.86 | E4 / C5 / C5 |
| piano | -27.4 dB | 0.76 | 0.80 | C3 / E4 / C5 |
| vocals | -39.2 dB | 0.91 | 1.03 | C♯4 / A♯4 / D6 |
| other | -4.1 dB | 0.95 | 3.82 | E4 / B4 / D5 |

Los stems son categorías estimadas, no pistas maestras originales. `htdemucs_6s` es experimental para piano/guitarra y puede producir bleed; un stem débil no debe crear automáticamente una voz.

## Traducción propuesta a Plantia

Plantia debe conservar relaciones (pedal, capas, densidad, registros y espacio), no reproducir la melodía. La referencia sugiere un centro en C con mucho pedal y colores suspendidos; por eso la progresión inicial `[0, 0, 3, 0]` mantiene el centro y abre brevemente el cuarto grado.

| Evidencia | Estado | Rol | Preset inicial | Octavas |
| --- | --- | --- | --- | --- |
| bass | candidate | foundation | meadow | [2, 3] |
| drums | candidate | pulse | congas | n/a |
| guitar | candidate | lead | guitar | [3, 5] |
| piano | review/likely bleed | accent | pianoforte | [3, 5] |
| vocals | review/likely bleed | counterline | mixed-choir | [3, 5] |
| other | candidate | pad | peace | [3, 4] |

```json
{
  "style_template": "ritual",
  "reason": "pedal grave, pulso estable y capas armónicas; requiere una partitura nueva, no copiar ritual",
  "harmony": {
    "detected_key": "C major",
    "scale": "Ionian",
    "notes": [
      0,
      2,
      4,
      5,
      7,
      9,
      11
    ],
    "tuning": 440
  },
  "tempo_reference_bpm": 86.1,
  "progression_hypothesis": [
    0,
    0,
    3,
    0
  ],
  "slots": [
    {
      "source_stem": "bass",
      "status": "candidate",
      "role": "foundation",
      "kind": "synth",
      "defaultPreset": "meadow",
      "octaves": [
        2,
        3
      ],
      "relative_rms_db": -11.3
    },
    {
      "source_stem": "drums",
      "status": "candidate",
      "role": "pulse",
      "kind": "instrument",
      "defaultPreset": "congas",
      "octaves": null,
      "relative_rms_db": -10.2
    },
    {
      "source_stem": "guitar",
      "status": "candidate",
      "role": "lead",
      "kind": "instrument",
      "defaultPreset": "guitar",
      "octaves": [
        3,
        5
      ],
      "relative_rms_db": -6.9
    },
    {
      "source_stem": "piano",
      "status": "review/likely bleed",
      "role": "accent",
      "kind": "instrument",
      "defaultPreset": "pianoforte",
      "octaves": [
        3,
        5
      ],
      "relative_rms_db": -27.4
    },
    {
      "source_stem": "vocals",
      "status": "review/likely bleed",
      "role": "counterline",
      "kind": "instrument",
      "defaultPreset": "mixed-choir",
      "octaves": [
        3,
        5
      ],
      "relative_rms_db": -39.2
    },
    {
      "source_stem": "other",
      "status": "candidate",
      "role": "pad",
      "kind": "synth",
      "defaultPreset": "peace",
      "octaves": [
        3,
        4
      ],
      "relative_rms_db": -4.1
    }
  ]
}
```

## Decisiones que aún requieren oído humano

1. Confirmar si `vocals` es realmente voz/coro o una fuga de un sintetizador agudo.
2. Confirmar si la capa dominante es guitarra pulsada; Demucs la clasifica así, pero el timbre final debe elegirse escuchando el stem.
3. Decidir si el pulso debe mapearse a congas, percusión sintética nueva o quedar implícito en el arpegio.
4. Diseñar una regla propia en `rules/orchestra.ts`: el `style_template` solo describe parentesco y no es una implementación reutilizable directa.

## Criterio de implementación

- Mantener máximo cinco voces activas; omitir candidatos marcados `review/likely bleed` salvo confirmación.
- Usar notas largas en fundamento/pad y un patrón repetitivo con variaciones acotadas para la voz pulsada.
- Conservar C como pedal frecuente y usar sus2/sus4 antes que cromatismos detectados débilmente.
- Hacer que la planta module densidad, apertura y entradas, sin copiar la secuencia exacta del fragmento.
