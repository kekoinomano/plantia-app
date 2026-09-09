// Small, reproducible FluidR3 subset; download audio, never execute remote code.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const directory = new URL('../assets/audio/sonora/', import.meta.url);
const manifestUrl = new URL('manifest.json', directory);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
const repository = 'paulrosen/midi-js-soundfonts';
const revision = manifest.windSource?.revision ?? manifest.percussionSource?.revision;
if (!revision) throw new Error('A pinned soundfont revision is required.');
const programs = {
  shakuhachi: [3, 4, 5], ocarina: [4, 5, 6], recorder: [3, 4, 5],
  shanai: [3, 4, 5], blown_bottle: [3, 4, 5],
};
let total = 0;
for (const [program, octaves] of Object.entries(programs)) {
  const samples = [];
  for (const octave of octaves) {
    const file = `${program}-C${octave}.mp3`;
    const source = `https://raw.githubusercontent.com/${repository}/${revision}/FluidR3_GM/${program}-mp3/C${octave}.mp3`;
    const destination = new URL(file, directory);
    let bytes;
    try { bytes = await readFile(destination); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const response = await fetch(source);
      if (!response.ok) throw new Error(`${source}: ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 100 || !(bytes.subarray(0, 3).toString() === 'ID3' || bytes[0] === 0xff))
        throw new Error(`Not MP3 audio: ${source}`);
      await writeFile(destination, bytes, { flag: 'wx' });
    }
    samples.push({ midi: 12 * (octave + 1), file, bytes: bytes.length, source,
      sha256: createHash('sha256').update(bytes).digest('hex') });
    total += bytes.length;
  }
  manifest.programs[program] = samples;
}
manifest.windSource = { repository, revision, license: 'CC-BY-3.0' };
await writeFile(manifestUrl, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Imported 5 winds, 15 MP3 samples: ${total} bytes.`);
