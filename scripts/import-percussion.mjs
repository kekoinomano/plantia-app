// Reproducible, small CC-BY-3.0 subset. Downloads audio bytes, never executes remote JS.
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const directory = new URL('../assets/audio/sonora/', import.meta.url);
const manifestUrl = new URL('manifest.json', directory);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
const repository = 'paulrosen/midi-js-soundfonts';
const commitResponse = await fetch(`https://api.github.com/repos/${repository}/commits/gh-pages`);
if (!commitResponse.ok) throw new Error(`Source lookup: ${commitResponse.status}`);
const revision = manifest.percussionSource?.revision ?? (await commitResponse.json()).sha;
const root = `https://raw.githubusercontent.com/${repository}/${revision}/FluidR3_GM`;
const kits = {
  bongos: [[60, 'C4'], [61, 'Db4']],
  congas: [[62, 'D4'], [63, 'Eb4'], [64, 'E4']],
  timbales: [[65, 'F4'], [66, 'Gb4']],
  maracas: [[70, 'Bb4']],
};
const pitched = { taiko_drum: [2, 3, 4], timpani: [2, 3, 4], kalimba: [3, 4, 5] };
let total = 0;
for (const [program, notes] of Object.entries({
  ...kits,
  ...Object.fromEntries(Object.entries(pitched).map(([name, octaves]) =>
    [name, octaves.map((octave) => [12 * (octave + 1), `C${octave}`])])),
})) {
  const samples = [];
  for (const [midi, note] of notes) {
    const source = `${root}/${program in kits ? 'percussion' : program}-mp3/${note}.mp3`;
    const file = `${program}-${note}.mp3`;
    const destination = new URL(file, directory);
    let bytes;
    try { await access(destination); bytes = await readFile(destination); }
    catch {
      const response = await fetch(source);
      if (!response.ok) throw new Error(`${source}: ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 100 || !(bytes.subarray(0, 3).toString() === 'ID3' || bytes[0] === 0xff))
        throw new Error(`Not MP3 audio: ${source}`);
      await writeFile(destination, bytes, { flag: 'wx' });
    }
    samples.push({ midi, file, bytes: bytes.length, source,
      sha256: createHash('sha256').update(bytes).digest('hex') });
    total += bytes.length;
  }
  manifest.programs[program] = samples;
}
manifest.percussionSource = { repository, revision, license: 'CC-BY-3.0' };
await writeFile(manifestUrl, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Imported 7 percussion instruments: ${total} bytes. Run npm run sonora:build.`);
