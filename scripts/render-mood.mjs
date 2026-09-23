// Replay raw recorded packets through the same wave composer used in the app.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { loadEngine, replay, render } from './lib/wave-replay.mjs';
const args=process.argv.slice(2);
const option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const input=option('--recording',null);
if(!input) throw Error('Use --recording datasamples/<file>.json; no synthetic plant input is generated.');
const engine=await loadEngine();
const id=option('--profile','deep-focus'),mood=engine.waveMood(id);
if(!mood) throw Error(`Unknown wave mood: ${id}`);
const output=resolve(option('--output',`output/${id}.mp3`));
if(!output.endsWith('.mp3')) throw Error('--output must end in .mp3');
const score=await replay(engine,JSON.parse(await readFile(input,'utf8')),{mood});
await mkdir(dirname(output),{recursive:true});
const audio=await render(engine,score,output);
await writeFile(`${output}.json`,JSON.stringify({profile:id,input,audio,bars:score.bars},null,2));
console.log(output);
