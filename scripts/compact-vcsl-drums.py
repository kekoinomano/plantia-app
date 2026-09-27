#!/usr/bin/env python3
"""Keep the quiet, repeated VCSL kit hits used by Lofi Ondas."""
from pathlib import Path
import os
import re
import subprocess

SOURCE = Path(os.environ.get('VCSL_SFZ_DIR', '/Users/sergio/Developer/VCSL-sfz'))
OUTPUT = Path('.sample-library/VCSL-Compact')
DRUMS = {
    'soft-kick': ('Membranophones/Struck Membranophones/Bass Drum 2.sfz',
                  62, 36, 'Soft Kick.sfz', 2.0, 0.22, 72),
    'soft-snare': ('Membranophones/Struck Membranophones/Snare Drum, Modern 2.sfz',
                   61, 38, 'Soft Snare.sfz', 1.5, 0.16, 83),
    'soft-hat': ('Idiophones/Struck Idiophones/Hi-Hat Cymbal.sfz',
                 42, 42, 'Soft Hat.sfz', 1.6, 0.08, 83),
}


def main():
    for name, (relative, old_key, new_key, patch_name, max_seconds, release, max_velocity) in DRUMS.items():
        source = SOURCE / relative
        if not source.is_file():
            raise FileNotFoundError(source)
        folder = OUTPUT / name
        sample_dir = folder / 'Samples'
        sample_dir.mkdir(parents=True, exist_ok=True)
        regions = []
        for block in re.split(r'(?m)^<region>\s*$', source.read_text())[1:]:
            values = dict(re.findall(r'(?m)^([a-zA-Z0-9_]+)=(.+)$', block))
            if int(values.get('pitch_keycenter', -1)) != old_key:
                continue
            if int(values.get('lovel', 0)) > max_velocity:
                continue
            wav = source.parent / values['sample']
            flac = sample_dir / (wav.stem + '.flac')
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav),
                            '-t', str(max_seconds), '-c:a', 'flac', str(flac)], check=True)
            values['sample'] = f'Samples/{flac.name}'
            values['pitch_keycenter'] = str(new_key)
            values['lokey'] = str(new_key)
            values['hikey'] = str(new_key)
            if int(values.get('hivel', 127)) >= max_velocity:
                values['hivel'] = '127'
            values['ampeg_release'] = str(release)
            regions.append('<region>\n' + '\n'.join(f'{key}={value}' for key, value in values.items()))
        if not regions:
            raise RuntimeError(f'No selected drum samples: {name}')
        (folder / patch_name).write_text(
            f'// Compact VCSL {source.stem}: key {new_key}, quiet hits and round robins.\n'
            + '<group>\nampeg_attack=0.004\n\n' + '\n\n'.join(regions) + '\n')
        print(f'{name}: {len(regions)} regions')


if __name__ == '__main__':
    main()
