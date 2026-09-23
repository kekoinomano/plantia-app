import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { loadEngine, replay } from './lib/wave-replay.mjs';
const engine=await loadEngine();
const recordings=await Promise.all((await readdir('datasamples')).filter(f=>f.endsWith('.json')).sort().map(async file=>({file,data:JSON.parse(await readFile(`datasamples/${file}`,'utf8'))})));
const candidates=[
  {name:'compressed-legacy-variation',lowMean:2,highMean:40,lowVariation:.00002,highVariation:.003},
  {name:'broad-mean',lowMean:1,highMean:80,lowVariation:.0005,highVariation:.4},
  {name:'observed-log-range',lowMean:2,highMean:40,lowVariation:.0005,highVariation:.4},
  {name:'headroom-mean',lowMean:2,highMean:50,lowVariation:.0005,highVariation:.5},
];
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const reports=[];
for(const {name,...calibration} of candidates){
 const runs=[];
 for(const {file,data} of recordings){
  const score=await replay(engine,data,{mood:engine.makeLofiMood(calibration)});
  const bars=score.bars.filter(b=>!b.summary.intro);
  const activities=bars.map(b=>b.summary.activity);
  const violations=bars.filter(b=>b.summary.peakPitchedVoices>5||b.notes.length>20||b.bpm<64||b.bpm>86).length;
  runs.push({file,tempo:median(bars.map(b=>b.bpm)),families:[...new Set(bars.map(b=>b.summary.scene))],
   saturation:activities.filter(v=>v<.01||v>.99).length/activities.length,
   sceneChanges:bars.filter((b,i)=>i&&b.summary.scene!==bars[i-1].summary.scene).length,
   melodicFingerprints:new Set(bars.map(b=>b.notes.filter(n=>['contour','detail'].includes(n.slot)).map(n=>`${n.step}:${n.midi}`).join('|')).filter(Boolean)).size,
   violations});
 }
 const tempoSpan=Math.max(...runs.map(r=>r.tempo))-Math.min(...runs.map(r=>r.tempo));
 const saturation=runs.reduce((s,r)=>s+r.saturation,0)/runs.length;
 const families=new Set(runs.flatMap(r=>r.families)).size;
 const passed=tempoSpan>=12&&saturation<.15&&families>=3&&runs.every(r=>!r.violations);
 const report={name,calibration,tempoSpan,saturation,families,passed,runs};reports.push(report);console.log(JSON.stringify(report));
}
await mkdir('output/lofi',{recursive:true});await writeFile('output/lofi/calibration.json',JSON.stringify(reports,null,2));
