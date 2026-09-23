import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { loadEngine, replay } from '../scripts/lib/wave-replay.mjs';
const engine = await loadEngine();
const quant = n => Math.round(n * 1e6) / 1e6;
const signature = score => score.notes.map(n => [quant(n.time),n.midi,quant(n.duration),n.slot,n.patch.preset,n.velocity]);
function packet(seq, value = 20000) { return { seq,elapsed_ms:seq*50,values:Array(10).fill(value) }; }
function warmed() {
  const detector = new engine.GreetingDetector();
  for(let i=0;i<80;i++) assert.equal(detector.push(packet(i,20000+i%3),i*.05),null);
  return detector;
}

test('saludo crudo: antes de Fourier, reproducible, bidireccional, con cooldown y límites',()=>{
  for(const value of [80000,4000]) {
    const detector=warmed();
    const event=detector.push(packet(80,value),4);
    assert.ok(event); assert.equal(event.direction,value>20000?1:-1);
    assert.equal(detector.push(packet(81,value),4.05),null);
    for(let i=82;i<500;i++) assert.equal(detector.push(packet(i,value),i*.05),null,'Un escalón sostenido no es una cadena de saludos');
  }
  const detector=warmed();
  assert.equal(detector.push(packet(80,1_440_610_698),4),null,'Dato fuera del contrato, no saludo');
  assert.equal(detector.push(packet(81,80000),4.05),null,'Tras invalidación debe reunir nueva referencia');
  const gap=warmed(); assert.equal(gap.push(packet(80,80000),20),null,'No saludar una reconexión');
  const cold=new engine.GreetingDetector(); assert.equal(cold.push(packet(0,80000),0),null);
});

test('no confunde oscilación periódica extrema con un saludo nuevo',()=>{
  const detector=new engine.GreetingDetector(); const events=[];
  for(let i=0;i<500;i++) {
    const p=packet(i);p.values=p.values.map((_,j)=>j===0?11000:1800+(i+j)%50);
    const event=detector.push(p,i*.05);if(event)events.push(event);
  }
  assert.equal(events.length,0);
});

test('cuatro capturas completas: mismo flujo crudo, voz mono, rangos, armonía y diversidad',async()=>{
  const stats=[];
  for(const file of (await readdir('datasamples')).filter(f=>f.endsWith('.json')).sort()) {
    const recording=JSON.parse(await readFile(`datasamples/${file}`,'utf8'));
    const score=await replay(engine,recording);
    assert.ok(score.frames.length>40); assert.ok(score.bars.length>25);
    assert.ok(score.notes[0].time<5,'Arranque después de la primera ventana corta completa');
    for(const frame of score.frames) {
      assert.ok(frame.short.waves.length<=8 && frame.long.waves.length<=8);
      assert.equal(frame.short.fit.target,95);
      assert.equal(frame.long.fit.target,frame.warmingUp?95:80);
    }
    for(const bar of score.bars) {
      assert.ok(bar.bpm>=64&&bar.bpm<=86);
      assert.ok(bar.notes.length>=5&&bar.notes.length<=20,`Presupuesto de ataques: ${bar.notes.length}`);
      assert.ok(bar.summary.peakPitchedVoices<=5);
      assert.ok(bar.notes.some(n=>n.slot==='foundation'));
      const schedules=bar.summary.voiceSchedule;
      const lead=schedules.filter(n=>n.slot==='contour'||n.slot==='detail').sort((a,b)=>a.startBeat-b.startBeat);
      for(let i=1;i<lead.length;i++) assert.ok(lead[i].startBeat>=lead[i-1].endBeat);
      for(const n of schedules) assert.ok(n.endBeat<4&&n.gateEndBeat>n.startBeat);
      for(const n of bar.notes) {
        assert.ok(n.beats>0&&Number.isFinite(n.beats));
        assert.ok(n.components.length>0);
        if(n.slot==='contour'||n.slot==='detail') assert.ok(n.midi>=60&&n.midi<=72);
        if(n.slot==='foundation') assert.ok(n.midi>=53&&n.midi<=65);
        if(n.slot==='bass') assert.ok(n.midi>=33&&n.midi<=48);
      }
    }
    const renamed={...recording,session:{...recording.session,name:'Otra etiqueta',id:'not-a-seed'}};
    const repeat=await replay(engine,renamed);
    assert.deepEqual(signature(score),signature(repeat),'Mismos datos: misma música, sin seed del nombre');
    const mid=score.bars[Math.floor(score.bars.length/2)];
    stats.push({file,tempo:mid.bpm,scene:mid.summary.scene,notes:JSON.stringify(signature(score))});
  }
  assert.equal(new Set(stats.map(s=>s.notes)).size,4);
  assert.ok(new Set(stats.map(s=>s.scene)).size>=3);
  assert.ok(Math.max(...stats.map(s=>s.tempo))-Math.min(...stats.map(s=>s.tempo))>10);
});

test('el saludo entra en el compositor sin FFT y deja la primera línea libre',async()=>{
  // Small periods accumulate less than 3 sensor seconds: no Fourier frame yet.
  const composer=new engine.WaveComposer(engine.sanitizeConfiguration({profile:'lofi-waves',volume:1}),engine.lofiWaves,()=>{},e=>{throw e;});
  const events=[];
  for(let i=0;i<100;i++) {
    const p=packet(i,i===80?8000:1000);composer.push(p,i*.05);await composer.whenAnalysisIdle();composer.advance(i*.05);events.push(...composer.drain());
  }
  assert.equal(composer.analysisSnapshot,null);
  const greetings=events.filter(e=>e.type==='note'&&e.note.rawGreeting);
  assert.equal(greetings.length,2); assert.ok(greetings.every(e=>e.note.rawGreeting.sequence===80));
  assert.ok(greetings.every(e=>e.note.slot==='counter'&&!e.note.wave));
  assert.ok(events.some(e=>e.type==='release'&&e.slot==='contour'));
  composer.finish(5);
});

test('reset, caducidad y fuera de rango no reciclan notas de otra sesión',async()=>{
  const records=JSON.parse(await readFile('datasamples/plantia-06c15f5e-bf93-40bc-b166-77fc624987ea.json','utf8'));
  const composer=new engine.WaveComposer(engine.sanitizeConfiguration({profile:'lofi-waves',volume:1}),engine.lofiWaves,()=>{},e=>{throw e;});
  for(const p of records.packets.filter(p=>p.elapsed_ms<6000)){composer.push(p,p.elapsed_ms/1000);await composer.whenAnalysisIdle();composer.advance(p.elapsed_ms/1000);composer.drain();}
  composer.advance(20);const events=composer.drain();assert.ok(events.some(e=>e.type==='release'));assert.equal(events.filter(e=>e.type==='note').length,0);
  composer.finish(21);composer.push(packet(0),22);composer.advance(22);assert.equal(composer.drain().filter(e=>e.type==='note').length,0);
});
