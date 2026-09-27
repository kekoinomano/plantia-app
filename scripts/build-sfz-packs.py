#!/usr/bin/env python3
"""Package the compact SFZ instruments used by the five wave moods.

The local source folders are in .sample-library; the resulting sfzpack files
are the assets consumed by the Android and iOS app.
"""
from pathlib import Path
import json
import re
import sys
import zipfile

SOURCE = Path('.sample-library')
OUTPUT = Path('assets/audio/sfz')
INSTRUMENTS = {
    'piano-steinway': ('SteinwayB-Compact', 'Steinway B Compact.sfz'),
    'bass-recorder': ('VCSL-Compact/bass-recorder', 'Baroque Bass Recorder - Sustain.sfz'),
    'renaissance-organ': ('VCSL-Compact/renaissance-organ', 'Renaissance Organ - Full.sfz'),
    'vibraphone': ('VCSL-Compact/vibraphone', 'Vibraphone - Soft Mallets.sfz'),
    'tenor-saxophone': ('VCSL-Compact/tenor-saxophone', 'Tenor Saxophone - Non-Vibrato.sfz'),
    'tenor-saxophone-short': ('VCSL-Compact/tenor-saxophone', 'Tenor Saxophone - Staccato.sfz'),
    'strumstick': ('VCSL-Compact/strumstick', 'Strumstick.sfz'),
    'dan-tranh': ('VCSL-Compact/dan-tranh', 'Dan Tranh - Normal.sfz'),
    'soft-kick': ('VCSL-Compact/soft-kick', 'Soft Kick.sfz'),
    'soft-snare': ('VCSL-Compact/soft-snare', 'Soft Snare.sfz'),
    'soft-hat': ('VCSL-Compact/soft-hat', 'Soft Hat.sfz'),
}


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    previous = json.loads((OUTPUT / 'manifest.json').read_text()) if (OUTPUT / 'manifest.json').exists() else {}
    selected = set(sys.argv[1:])
    if selected - INSTRUMENTS.keys():
        raise RuntimeError(f'Unknown instruments: {sorted(selected - INSTRUMENTS.keys())}')
    manifest = previous.copy() if selected else {}
    for name, (folder, patch) in INSTRUMENTS.items():
        if selected and name not in selected:
            continue
        root = SOURCE / folder
        sfz = root / patch
        if not sfz.is_file():
            raise RuntimeError(f'Missing compact SFZ: {sfz}')
        patch_text = sfz.read_text()
        if name == 'tenor-saxophone':
            patch_text = patch_text.replace('ampeg_release=0.500000',
                'ampeg_release=0.220000\npolyphony=1\nfil_type=lpf_2p\ncutoff=4800\n'
                'pitchlfo_freq=4.8\npitchlfo_depth=8\npitchlfo_delay=0.5\npitchlfo_fade=0.25')
        elif name == 'tenor-saxophone-short':
            patch_text = patch_text.replace('ampeg_release=1.500000',
                'ampeg_release=0.140000\npolyphony=1\nfil_type=lpf_2p\ncutoff=5600')
        samples = sorted(set(re.findall(r'(?m)^\s*sample=([^\r\n]+)$', patch_text)))
        files = [sfz] + [root / sample.strip() for sample in samples]
        if not samples or not all(file.is_file() for file in files):
            raise RuntimeError(f'Incomplete compact instrument: {name}')
        target = OUTPUT / f'{name}.sfzpack'
        with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_STORED) as archive:
            archive.writestr(patch, patch_text)
            for file in files[1:]:
                archive.write(file, file.relative_to(root))
        if target.stat().st_size >= 100_000_000:
            raise RuntimeError(f'Package exceeds 100 MB: {target}')
        manifest[name] = {**previous.get(name, {}), 'patch': patch, 'pack': target.name, 'samples': len(samples)}
        print(name, manifest[name], flush=True)
    if 'piano-ghibli' in previous and all((OUTPUT / f'piano-ghibli-{name}.sfzpack').exists() for name in ('soft', 'medium', 'bright')):
        manifest['piano-ghibli'] = previous['piano-ghibli']
    if 'bell-tree' in previous and (OUTPUT / 'bell-tree.sfzpack').exists():
        manifest['bell-tree'] = previous['bell-tree']
    if not selected:
        for old in OUTPUT.glob('*.sfzpack'):
            if old.name not in {entry['pack'] for entry in manifest.values()} and not old.name.startswith('piano-ghibli-'):
                old.unlink()
    (OUTPUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
