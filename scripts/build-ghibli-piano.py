#!/usr/bin/env python3
"""Make a three-velocity Steinway SFZ for Ghibli from the local VCSL archive.

Keep the sampled Ghibli range (MIDI 39–82) and the matching key releases.
The source archive is local development material, not bundled into the app.
"""
from pathlib import Path
import json
import re
import subprocess
import tempfile
import zipfile

SOURCE = Path('.sample-library/VCSL-v1.2.2-RC.zip')
SOURCE_PREFIX = 'VCSL-1.2.2-RC/Chordophones/Zithers/'
ORIGINAL = SOURCE_PREFIX + 'Grand Piano, Steinway B.sfz'
COMPACT = Path('.sample-library/SteinwayB-Compact/Steinway B Compact.sfz')
COMPACT_ROOT = COMPACT.parent
OUTPUT = Path('assets/audio/sfz')
PATCH = 'Steinway B Ghibli.sfz'


def regions(text):
    for chunk in text.split('<region>')[1:]:
        values = dict(re.findall(r'(?m)^([a-z_0-9]+)=([^\r\n]+)', chunk.split('<group>')[0]))
        if 'sample' in values:
            yield values


def overlaps(region):
    return int(region['hikey']) >= 39 and int(region['lokey']) <= 82


def sfz_region(region, sample):
    fields = ('lovel', 'hivel', 'pitch_keycenter', 'volume')
    lines = ['<region>', f'sample={sample}',
             f'lokey={max(39, int(region["lokey"]))}',
             f'hikey={min(82, int(region["hikey"]))}']
    lines += [f'{key}={region[key]}' for key in fields if key in region]
    return '\n'.join(lines) + '\n'


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(SOURCE) as source, tempfile.TemporaryDirectory() as temporary:
        original = source.read(ORIGINAL).decode()
        notes = [r for r in regions(original) if '/NoSus/' in r['sample'] and overlaps(r)]
        release = [r for r in regions(COMPACT.read_text()) if '/Rel/' in r['sample'] and overlaps(r)]
        if not notes or not release:
            raise RuntimeError('Missing Steinway piano regions')
        chunks = {2: [], 3: [], 4: []}
        patch = ['// VCSL Steinway B: three recorded velocities, Ghibli keyboard range.',
                 '<group>\nampeg_attack=0.004\nampeg_release=0.4\n']
        for region in notes:
            sample = region['sample']
            layer = int(re.search(r'_vl([234])_', sample).group(1))
            target = 'Samples/NoSus/' + Path(sample).name.replace('.wav', '.flac')
            wav = source.read(SOURCE_PREFIX + sample)
            # A pipe cannot be rewound to fill FLAC's STREAMINFO total-samples
            # field. sfizz 1.2.3 preloads zero frames and crashes on Android.
            converted = Path(temporary) / 'note.flac'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', 'pipe:0',
                            '-c:a', 'flac', '-compression_level', '5',
                            str(converted)], input=wav, check=True)
            encoded = converted.read_bytes()
            total_samples = int.from_bytes(encoded[18:26], 'big') & ((1 << 36) - 1)
            if not encoded.startswith(b'fLaC') or total_samples == 0:
                raise RuntimeError(f'FLAC without frame count: {sample}')
            chunks[layer].append((target, encoded))
            patch.append(sfz_region(region, target))
        patch.append('<group>\nampeg_attack=0.1\ntrigger=release\n')
        for region in release:
            target = region['sample']
            chunks[2].append((target, (COMPACT_ROOT / target).read_bytes()))
            patch.append(sfz_region(region, target))
        chunks[3].append((PATCH, ('\n'.join(patch)).encode()))
        for layer, name in ((2, 'soft'), (3, 'medium'), (4, 'bright')):
            target = OUTPUT / f'piano-ghibli-{name}.sfzpack'
            with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_STORED) as pack:
                for path, data in chunks[layer]:
                    pack.writestr(path, data)
            if target.stat().st_size >= 100_000_000:
                raise RuntimeError(f'Steinway package exceeds 100 MB: {target}')
            print(target, len(chunks[layer]), target.stat().st_size, flush=True)
        catalog = OUTPUT / 'manifest.json'
        manifest = json.loads(catalog.read_text())
        manifest['piano-ghibli'] = {
            'patch': PATCH,
            'packs': [f'piano-ghibli-{name}.sfzpack' for name in ('soft', 'medium', 'bright')],
            'samples': sum(map(len, chunks.values())) - 1,
            'program': 'ghibli_grand_piano', 'gain': 2.2,
        }
        catalog.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
