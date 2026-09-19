# Pipeline para crear moods desde una referencia

El objetivo no es clonar una canción. El pipeline extrae una firma musical auditable y la traduce a decisiones compatibles con el motor generativo de Plantia.

## Uso

Requiere Python 3.11 o 3.12 y `ffmpeg`:

```bash
python3.12 -m venv .venv-mood
source .venv-mood/bin/activate
pip install -r scripts/requirements-mood-analysis.txt
python scripts/analyze-mood.py referencia.mp3 --output mood-analysis/referencia
```

La primera ejecución descarga el modelo gratuito `htdemucs_6s`. El audio se procesa localmente. Se generan stems MP3, `analysis.json` para automatización y `mood-brief.md` para revisión.

## Cadena elegida

1. [**Demucs `htdemucs_6s`**](https://github.com/facebookresearch/demucs) separa bajo, batería, guitarra, piano, voz y resto. Piano y guitarra son estimaciones experimentales: siempre se revisan por oído.
2. [**librosa**](https://librosa.org/doc/main/) mide tempo, ataques, chroma, tonalidad probable, harmonicidad, espectro, estéreo y registro aproximado.
3. [**Basic Pitch**](https://github.com/spotify/basic-pitch) es un segundo paso opcional para transcribir a MIDI solo stems melódicos ya aislados. No forma parte del entorno base porque en Apple Silicon su soporte oficial está limitado a Python 3.10. El brief ya contiene lo necesario para diseñar el mood sin copiar notas.
4. El brief traduce fuentes a roles y presets existentes. Una persona confirma timbres ambiguos y el director musical implementa patrones generativos propios.

Como ampliación, [Essentia](https://essentia.upf.edu/documentation.html) ofrece extractores y modelos preentrenados de instrumentos, estilos y mood. Conviene añadirlo cuando necesitemos etiquetado semántico más fino; sus modelos no comerciales y la disponibilidad desigual de binarios en macOS hacen que no sea una dependencia base adecuada para este flujo.

## Por qué no depender de APIs web

Esta ruta no tiene cuota, mantiene el audio en local y es reproducible. Servicios comerciales pueden separar mejor mezclas difíciles, pero no eliminan la revisión musical ni producen directamente una partitura Plantia.
