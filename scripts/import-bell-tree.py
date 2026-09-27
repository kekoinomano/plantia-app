#!/usr/bin/env python3
"""Pack the five VCSL bell tree strokes for the shared greeting."""
from pathlib import Path
import json
import re
import subprocess
import tempfile
import zipfile

SOURCE = Path('/Users/sergio/Developer/VCSL-sfz/Idiophones/Struck Idiophones/Bell Tree/Stroke')
OUTPUT = Path('assets/audio/sfz')
STROKES = (1, 3, 4, 6, 10)
PATCH = 'Bell Tree.sfz'


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stderr


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    regions = []
    with tempfile.TemporaryDirectory() as temporary:
        converted = []
        for index, stroke in enumerate(STROKES):
            source = SOURCE / f'BellTree_Stroke_{stroke}_Mid.wav'
            if not source.is_file():
                raise FileNotFoundError(source)
            report = run('ffmpeg', '-i', str(source), '-af', 'volumedetect', '-f', 'null', '-')
            maximum = float(re.search(r'max_volume: ([-\d.]+) dB', report).group(1))
            sample = Path(temporary) / f'stroke-{stroke}.flac'
            run('ffmpeg', '-y', '-i', str(source), '-af', f'volume={-10 - maximum:.2f}dB',
                '-ar', '32000', '-c:a', 'flac', '-compression_level', '8', str(sample))
            converted.append(sample)
            regions.append(f'<region>\nsample=Samples/{sample.name}\nkey={60 + index}\n'
                           f'pitch_keycenter={60 + index}\nloop_mode=one_shot')
        sfz = '<group>\nampeg_attack=0.005\nampeg_release=0.2\n\n' + '\n\n'.join(regions) + '\n'
        target = OUTPUT / 'bell-tree.sfzpack'
        with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_STORED) as archive:
            archive.writestr(PATCH, sfz)
            for sample in converted:
                archive.write(sample, f'Samples/{sample.name}')
    manifest = OUTPUT / 'manifest.json'
    catalog = json.loads(manifest.read_text())
    catalog['bell-tree'] = {'patch': PATCH, 'pack': target.name, 'samples': len(STROKES),
                            'program': 'bell_tree', 'gain': 2.2, 'minNote': 60, 'maxNote': 64}
    manifest.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + '\n')
    print(f'{target}: {target.stat().st_size} bytes, {len(STROKES)} strokes')


if __name__ == '__main__':
    main()
