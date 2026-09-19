#!/usr/bin/env python3
"""Turn a short musical reference into an auditable Plantia mood brief."""

from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

import librosa
import numpy as np


NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
SCALES = {
    "Ionian": [0, 2, 4, 5, 7, 9, 11],
    "Doric": [0, 2, 3, 5, 7, 9, 10],
    "Lydian": [0, 2, 4, 6, 7, 9, 11],
    "Mixolydian": [0, 2, 4, 5, 7, 9, 10],
    "Aeolian": [0, 2, 3, 5, 7, 8, 10],
    "Maj Pentatonic": [0, 2, 4, 7, 9],
    "Min Pentatonic": [0, 3, 5, 7, 10],
}
STEM_ORDER = ["bass", "drums", "guitar", "piano", "vocals", "other"]


def cli() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--stems-dir", type=Path, help="Reuse a directory containing Demucs stems")
    parser.add_argument("--no-separation", action="store_true", help="Analyse only the mix")
    return parser.parse_args()


def separate(audio: Path, output: Path) -> Path:
    if not shutil.which("ffmpeg"):
        raise SystemExit("ffmpeg is required for decoding and Demucs output")
    target = output / "demucs"
    command = [
        sys.executable, "-m", "demucs.separate", "-n", "htdemucs_6s",
        "--mp3", "--mp3-bitrate", "192", "--clip-mode", "clamp",
        "-o", str(target), str(audio),
    ]
    if sys.platform == "darwin":
        command[6:6] = ["--device", "mps"]
    subprocess.run(command, check=True)
    return target / "htdemucs_6s" / audio.stem


def key_candidates(chroma: np.ndarray) -> list[dict]:
    candidates = []
    for root in range(12):
        for mode, profile in (("major", MAJOR_PROFILE), ("minor", MINOR_PROFILE)):
            score = float(np.corrcoef(chroma, np.roll(profile, root))[0, 1])
            candidates.append({"key": f"{NOTE_NAMES[root]} {mode}", "score": round(score, 3)})
    return sorted(candidates, key=lambda item: item["score"], reverse=True)[:4]


def normalise_tempo(raw: float) -> float:
    while raw > 130:
        raw /= 2
    while raw < 60:
        raw *= 2
    return raw


def pitch_range(y: np.ndarray, sr: int) -> dict | None:
    pitches, magnitudes = librosa.piptrack(y=y, sr=sr, fmin=45, fmax=3000)
    bins = np.argmax(magnitudes, axis=0)
    hz = pitches[bins, np.arange(pitches.shape[1])]
    strength = magnitudes[bins, np.arange(magnitudes.shape[1])]
    hz = hz[(strength > np.percentile(strength, 65)) & (hz > 0)]
    if len(hz) < 8:
        return None
    values = np.percentile(librosa.hz_to_midi(hz), [10, 50, 90])
    return {
        "midi_p10_p50_p90": [round(float(value), 1) for value in values],
        "notes_p10_p50_p90": [str(librosa.midi_to_note(value)) for value in values],
    }


def chord_summary(chroma: np.ndarray, beats: np.ndarray) -> list[str]:
    labels = []
    templates = (("", [0, 4, 7]), ("m", [0, 3, 7]), ("sus2", [0, 2, 7]), ("sus4", [0, 5, 7]))
    for start in range(0, max(0, len(beats) - 4), 4):
        vector = np.mean(chroma[:, beats[start]:beats[start + 4]], axis=1)
        best = (-1.0, "")
        for root in range(12):
            for suffix, intervals in templates:
                template = np.zeros(12)
                template[(root + np.array(intervals)) % 12] = 1
                score = float(np.dot(vector, template) / (np.linalg.norm(vector) * np.linalg.norm(template) + 1e-9))
                best = max(best, (score, NOTE_NAMES[root] + suffix))
        if not labels or labels[-1] != best[1]:
            labels.append(best[1])
    return labels


def analyse(path: Path, include_chords: bool = False) -> dict:
    stereo, sr = librosa.load(path, sr=22050, mono=False)
    y = librosa.to_mono(stereo) if stereo.ndim == 2 else stereo
    harmonic, _ = librosa.effects.hpss(y)
    onset = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, beats = librosa.beat.beat_track(onset_envelope=onset, sr=sr)
    raw_tempo = float(np.asarray(tempo).item())
    chroma_frames = librosa.feature.chroma_cqt(y=harmonic, sr=sr)
    chroma = np.mean(chroma_frames, axis=1)
    rms_frames = librosa.feature.rms(y=y)[0]
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr, roll_percent=0.85)[0]
    result = {
        "file": path.name,
        "duration_seconds": round(float(librosa.get_duration(y=y, sr=sr)), 2),
        "rms": float(np.sqrt(np.mean(y * y))),
        "peak": round(float(np.max(np.abs(y))), 4),
        "dynamic_spread_db": round(float(librosa.amplitude_to_db(np.array([
            np.percentile(rms_frames, 90) / max(np.percentile(rms_frames, 10), 1e-8)
        ]))[0]), 1),
        "tempo_raw_bpm": round(raw_tempo, 1),
        "tempo_musical_bpm": round(normalise_tempo(raw_tempo), 1),
        "beat_count": int(len(beats)),
        "onsets_per_second": round(float(len(librosa.onset.onset_detect(
            onset_envelope=onset, sr=sr)) / librosa.get_duration(y=y, sr=sr)), 2),
        "harmonic_ratio": round(float(np.sum(harmonic * harmonic) / (np.sum(y * y) + 1e-12)), 3),
        "spectral_centroid_hz": round(float(np.mean(centroid))),
        "spectral_rolloff_85_hz": round(float(np.mean(rolloff))),
        "spectral_flatness": round(float(np.mean(librosa.feature.spectral_flatness(y=y)[0])), 4),
        "key_candidates": key_candidates(chroma),
        "dominant_pitch_classes": [NOTE_NAMES[index] for index in np.argsort(chroma)[::-1][:7]],
        "pitch_range": pitch_range(y, sr),
    }
    if path.stem == "drums":
        result["pitch_range"] = None
    if stereo.ndim == 2:
        left, right = stereo[0], stereo[1]
        mid, side = (left + right) / 2, (left - right) / 2
        result["stereo_side_to_mid_db"] = round(float(20 * math.log10(
            max(np.sqrt(np.mean(side * side)), 1e-9) / max(np.sqrt(np.mean(mid * mid)), 1e-9)
        )), 1)
    if include_chords:
        result["chord_hypothesis"] = chord_summary(chroma_frames, beats)
    return result


def plantia_translation(mix: dict, stems: list[dict]) -> dict:
    key = mix["key_candidates"][0]["key"]
    root_name, mode = key.split()
    root = NOTE_NAMES.index(root_name)
    scale_name = "Ionian" if mode == "major" else "Aeolian"
    notes = [(root + interval) % 12 for interval in SCALES[scale_name]]
    by_name = {Path(item["file"]).stem: item for item in stems}
    slots = []
    recipes = {
        "bass": ("foundation", "synth", "meadow", [2, 3]),
        "other": ("pad", "synth", "peace", [3, 4]),
        "guitar": ("lead", "instrument", "guitar", [3, 5]),
        "vocals": ("counterline", "instrument", "mixed-choir", [3, 5]),
        "drums": ("pulse", "instrument", "congas", None),
        "piano": ("accent", "instrument", "pianoforte", [3, 5]),
    }
    for name in STEM_ORDER:
        item = by_name.get(name)
        if not item:
            continue
        role, kind, preset, octaves = recipes[name]
        db = item["rms_vs_mix_db"]
        slots.append({
            "source_stem": name,
            "status": "candidate" if db >= -18 else "review/likely bleed",
            "role": role,
            "kind": kind,
            "defaultPreset": preset,
            "octaves": octaves,
            "relative_rms_db": db,
        })
    return {
        "style_template": "ritual",
        "reason": "pedal grave, pulso estable y capas armónicas; requiere una partitura nueva, no copiar ritual",
        "harmony": {"detected_key": key, "scale": scale_name, "notes": notes, "tuning": 440},
        "tempo_reference_bpm": mix["tempo_musical_bpm"],
        "progression_hypothesis": [0, 0, 3, 0],
        "slots": slots,
    }


def markdown(audio: Path, mix: dict, stems: list[dict], translation: dict) -> str:
    stem_rows = []
    for item in stems:
        stem = Path(item["file"]).stem
        register = item["pitch_range"]
        register_text = "—" if not register else " / ".join(register["notes_p10_p50_p90"])
        stem_rows.append(
            f"| {stem} | {item['rms_vs_mix_db']:+.1f} dB | {item['harmonic_ratio']:.2f} | "
            f"{item['onsets_per_second']:.2f} | {register_text} |"
        )
    slot_rows = []
    for slot in translation["slots"]:
        slot_rows.append(
            f"| {slot['source_stem']} | {slot['status']} | {slot['role']} | "
            f"{slot['defaultPreset']} | {slot['octaves'] or 'n/a'} |"
        )
    candidates = ", ".join(
        f"{item['key']} ({item['score']:.2f})" for item in mix["key_candidates"][:3]
    )
    chords = " → ".join(mix.get("chord_hypothesis", [])) or "sin datos suficientes"
    payload = json.dumps(translation, indent=2, ensure_ascii=False)
    return f"""# Mood brief · {audio.stem}

Generado automáticamente a partir de `{audio.name}`. Es un brief de inspiración, no una transcripción ni una afirmación musicológica.

## Firma de la referencia

- Duración: {mix['duration_seconds']:.2f} s.
- Tempo detectado: {mix['tempo_raw_bpm']:.1f} BPM; interpretación musical recomendada: **{mix['tempo_musical_bpm']:.1f} BPM** (se corrige el posible doble tiempo).
- Tonalidad candidata: **{translation['harmony']['detected_key']}**. Alternativas: {candidates}.
- Clases de altura dominantes: {', '.join(mix['dominant_pitch_classes'])}.
- Hipótesis armónica por bloques: {chords}.
- Carácter: harmonicidad {mix['harmonic_ratio']:.2f}, {mix['onsets_per_second']:.2f} ataques/s, centro espectral {mix['spectral_centroid_hz']} Hz, amplitud estéreo side/mid {mix.get('stereo_side_to_mid_db', 0):+.1f} dB.

## Separación de fuentes

| Stem Demucs | RMS frente a mezcla | Harmonicidad | Ataques/s | Registro P10 / P50 / P90 |
| --- | ---: | ---: | ---: | --- |
{chr(10).join(stem_rows)}

Los stems son categorías estimadas, no pistas maestras originales. `htdemucs_6s` es experimental para piano/guitarra y puede producir bleed; un stem débil no debe crear automáticamente una voz.

## Traducción propuesta a Plantia

Plantia debe conservar relaciones (pedal, capas, densidad, registros y espacio), no reproducir la melodía. La referencia sugiere un centro en C con mucho pedal y colores suspendidos; por eso la progresión inicial `[0, 0, 3, 0]` mantiene el centro y abre brevemente el cuarto grado.

| Evidencia | Estado | Rol | Preset inicial | Octavas |
| --- | --- | --- | --- | --- |
{chr(10).join(slot_rows)}

```json
{payload}
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
"""


def main() -> None:
    args = cli()
    audio = args.audio.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    if not audio.is_file():
        raise SystemExit(f"Audio not found: {audio}")
    stems_dir = args.stems_dir.resolve() if args.stems_dir else None
    if not args.no_separation and stems_dir is None:
        stems_dir = separate(audio, output)
    mix = analyse(audio, include_chords=True)
    stem_paths = [] if stems_dir is None else sorted(
        (path for path in stems_dir.iterdir() if path.suffix.lower() in {".wav", ".mp3", ".flac"}),
        key=lambda path: STEM_ORDER.index(path.stem) if path.stem in STEM_ORDER else 99,
    )
    stems = [analyse(path) for path in stem_paths]
    for item in stems:
        item["rms_vs_mix_db"] = round(20 * math.log10(max(item["rms"], 1e-9) / mix["rms"]), 1)
    translation = plantia_translation(mix, stems)
    data = {"source": str(audio), "mix": mix, "stems": stems, "plantia_translation": translation}
    (output / "analysis.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    (output / "mood-brief.md").write_text(markdown(audio, mix, stems, translation))
    print(output / "mood-brief.md")


if __name__ == "__main__":
    main()
