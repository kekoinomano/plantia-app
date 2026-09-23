import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { loadEngine, replay, render } from './lib/wave-replay.mjs';

// Research auditions, not production rules. Retain measured harmony, bass,
// tempo and drums; compose the upper parts together rather than retiming the
// previous melody. See output/lofi/musical-options/NOTES.md.
const piano = process.argv.includes('--piano');
const out = resolve(piano ? 'output/lofi/piano-musical-options' : 'output/lofi/musical-options');
await mkdir(out, { recursive: true });
const engine = await loadEngine();
const input = 'datasamples/suegra2.json';
const score = await replay(engine, JSON.parse(await readFile(input, 'utf8')));
const replaced = n => ['foundation', 'contour', 'detail'].includes(n.slot);
const originalBacking = score.events.filter(e => e.type !== 'note' || !replaced(e.note));
const pc = n => (n % 12 + 12) % 12;
function nearest(classes, target, low, high) {
  return Array.from({ length: high-low+1 }, (_,i)=>low+i).filter(n=>classes.includes(pc(n)))
    .sort((a,b)=>Math.abs(a-target)-Math.abs(b-target)||a-b)[0];
}
const options = piano ? [
  { id: '01-piano-melodia-en-acordes', preset: 'pianoforte', kind: 'chord', description: 'Piano acústico: misma melodía superior y mismos apoyos que la opción de guitarra integrada.' },
  { id: '02-piano-motivo-resuelto', preset: 'pianoforte', kind: 'motif', description: 'Piano acústico: mismo motivo de pregunta y resolución que la guitarra, conservando su acompañamiento reducido.' },
] : [
  { id: '01-guitarra-melodia-en-acordes', preset: 'guitar', kind: 'chord', description: 'La melodía es la voz superior de acordes de guitarra, con dos apoyos por compás; no hay solista añadido.' },
  { id: '02-arpa-acorde-desplegado', preset: 'harp', kind: 'arp', description: 'Un único arpegio de arpa sustituye base y solista: mismo gesto rítmico, notas del acorde y conducción entre acordes.' },
  { id: '03-guitarra-motivo-resuelto', preset: 'guitar', kind: 'motif', description: 'Motivo de dos compases: pregunta sobre quinta/tercera y respuesta que descansa en la tercera. Acompañamiento reducido y más bajo.' },
];
const results = [];
for (const option of options) {
  const variant = structuredClone(score);
  variant.events = structuredClone(originalBacking);
  let serial = 100000, previousTop = 65;
  const generated = [];
  for (const [index, bar] of score.bars.entries()) {
    const beat = 60/bar.bpm;
    const end = Math.min(score.bars[index+1]?.time ?? bar.time+4*beat, score.duration)-.08;
    const inBar = score.notes.filter(n=>n.time>=bar.time-.001 && n.time<bar.time+4*beat-.001);
    const template = inBar.find(n=>n.slot==='foundation');
    const root = inBar.find(n=>n.slot==='bass');
    if (!template || !root) continue;
    const classes = [...new Set([pc(root.midi), ...bar.summary.voicing.map(pc)])];
    const third = classes.find(n=>[3,4].includes(pc(n-root.midi)));
    const fifth = classes.find(n=>pc(n-root.midi)===7);
    assert.notEqual(third, undefined);
    const top = nearest([third], previousTop,60,71);
    previousTop = top;
    const shell = [...new Set(bar.summary.voicing.map(n=>n>=top-2?n-12:n))]
      .filter(n=>n>=48 && n<top-2).slice(0,2);
    const dynamic = Math.min(3, Number(bar.summary.activity)*3);
    const add = (at, midi, gate, velocity, slot, preset=option.preset, release=22) => {
      const note = structuredClone(template);
      const time = bar.time+at*beat;
      const tail = .06+3.5*(release/100)**2;
      const duration = Math.min(gate*beat,end-time-tail);
      if (duration<.1) return;
      assert.ok(classes.includes(pc(midi)), 'Every new pitch belongs to the current chord');
      Object.assign(note,{id:serial++,time,midi,duration,velocity:velocity+dynamic,slot,pan:0,reason:option.description});
      note.patch.preset=preset;
      note.patch.chorus={on:false,depth:0,rate:5};
      note.patch.envelope={on:true,attack:8,release};
      note.patch.reverb={on:true,wet:12,amount:35};
      if(note.wave) {
        note.wave.rule=option.description;
        note.wave.musicalStep=at*4;
        note.wave.mapping='audition-chord-derived-phrase';
      }
      const event={type:'note',time,note}; generated.push(event); variant.events.push(event);
    };
    if(option.kind==='chord') {
      // The top is part of the played voicing, not an independent overlay.
      const second = index%2 ? top : nearest([fifth ?? third],top+2,60,71);
      for(const [at, melody, vel] of [[0,top,41],[2.5,second,index%2?35:38]]) {
        shell.forEach((n,i)=>add(at+i*.014,n,1.05,29-i,'foundation'));
        add(at+.035,melody,1.1,vel,'contour');
      }
    } else if(option.kind==='arp') {
      // One unified four-note gesture. Returning top notes are intentional.
      const low=nearest([pc(root.midi)],53,48,59);
      const middle=nearest([fifth ?? third],low+5,53,64);
      const line=[low,top,middle,top];
      const positions=[0,1,1.5+bar.swing/2,2.5];
      line.forEach((midi,i)=>add(positions[i],midi,i===3?1.05:.75,[33,40,30,35][i],i===0?'foundation':'contour'));
    } else {
      // Same two-bar rhythmic identity, carried through the plant's harmony.
      // Two quiet lower chord voices make room for the melodic third above.
      shell.forEach((n,i)=>add(i*.014,n,2.2,27-i,'foundation',template.patch.preset));
      const upper=nearest([fifth ?? third],top+3,60,72);
      const events=index%2===0 ? [[.5,top,.6,39],[1.5+bar.swing/2,upper,.6,36],[2.5,top,.75,35]]
        : [[.5,upper,.65,36],[1.5+bar.swing/2,top,1.35,33]];
      events.forEach(([at,midi,gate,vel])=>add(at,midi,gate,vel,'contour'));
    }
  }
  variant.events.sort((a,b)=>a.time-b.time);
  variant.notes=variant.events.filter(e=>e.type==='note').map(e=>e.note);
  assert.deepEqual(variant.notes.filter(n=>['bass','percussion'].includes(n.slot)),score.notes.filter(n=>['bass','percussion'].includes(n.slot)));
  const edges=variant.notes.filter(n=>n.slot!=='percussion').flatMap(n=>[
    {t:n.time,d:1},{t:n.time+n.duration+(n.slot==='bass'?.12:.06+3.5*(n.patch.envelope.release/100)**2),d:-1}
  ]).sort((a,b)=>a.t-b.t||a.d-b.d);
  let active=0,peakVoices=0; for(const e of edges){active+=e.d;peakVoices=Math.max(peakVoices,active);}
  assert.ok(peakVoices<=5);
  const audio=await render(engine,variant,`${out}/${option.id}.mp3`);
  assert.ok(audio.invalid===0 && audio.peak<1);
  results.push({...option,input,peakVoices,audio,notes:generated.map(e=>({time:e.time,midi:e.note.midi,slot:e.note.slot,duration:e.note.duration}))});
  console.log(`${option.id}: peak=${audio.peak.toFixed(3)}, voices=${peakVoices}`);
}
await writeFile(`${out}/summary.json`,JSON.stringify(results,null,2));
