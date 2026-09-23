import { clamp, nearestPitch, wrap, type WaveFrame } from '../features';
import { musicalField, signalIdentity, voiceLead } from '../musical-field';
import type { WaveMood, WaveNote, WaveBar, GreetingPhrase } from '../types';
import type { ListeningProfile } from '../../sonora/focus';
import type { RawGreeting } from '../greeting';

export type MoodSpec = {
  id: ListeningProfile['id']; name: string; description: string;
  tempo: readonly [number, number]; meter: number; sectionBars: number; chordBars: number;
  scale: readonly number[]; routes: readonly (readonly number[])[];
  base: string; lead: string; detail: string; texture: string; greeting: string;
  foundationKind: 'synth' | 'instrument'; counterKind?: 'synth' | 'instrument';
  levels: { body: number; lead: number; detail: number; bass: number; texture: number; greeting: number };
  room: number; attack: number; release: number; maxVoices: number;
  explanation: readonly string[];
  arrange: (c: MoodContext) => void;
  greet: (event: RawGreeting, chord: number[]) => GreetingPhrase;
};
const log = (n: number, lo: number, hi: number) => clamp(Math.log(Math.max(lo,n)/lo)/Math.log(hi/lo));
export function coordinates(frame: WaveFrame) {
  const identity=signalIdentity(frame.long);
  return { mean:log(frame.long.fit.mean,2,40), speed:log(identity.reference,.5,90),
    activity:log(frame.short.fittedRms/Math.max(1e-9,frame.short.fit.mean),.0005,.4),
    width:identity.width, concentration:frame.short.concentration, persistence:clamp(frame.long.persistence),
    reference:identity.reference };
}
export type MoodContext = {
  bar: number; phase: number; beat: number; bpm: number; meter: number;
  data: ReturnType<typeof coordinates>; identity: ReturnType<typeof coordinates>;
  frame: WaveFrame; source: WaveFrame; motifSource: WaveFrame;
  field: ReturnType<typeof musicalField>; chord: number[]; scale: number[]; tonic: number;
  voicing: number[]; notes: WaveNote[];
  add: (at: number, slot: string, preset: string, midi: number, beats: number, velocity: number,
    rule: string, extra?: Partial<WaveNote>) => void;
};
export const pitch = (classes: readonly number[], target: number, low=55, high=76) => nearestPitch(classes,target,low,high);
export const chordGesture = (preset: string, velocity: number, attack: number, release: number,
  event: RawGreeting, chord: number[], duration=.55): GreetingPhrase => ({
  holdSeconds: duration+.06+3.5*(release/100)**2+.15,
  notes:[{ after:0,duration,slot:'counter',preset,midi:pitch([chord[event.direction>0?1:0]],64,57,72),
    velocity:velocity+event.strength*2,color:.15,pan:0,attack,release,
    rule:'Saludo: extremo crudo previo a Fourier, gesto afinado en el acorde actual' }],
});

/** Common acquisition coordinates, phrase memory and bounded note occupancy.
 * Mood files own every musical choice. Neither input names nor random seeds enter.
 */
export function defineMood(spec: MoodSpec): WaveMood {
  const ids=[...new Set([spec.base,spec.greeting,
    ...(spec.levels.lead>0?[spec.lead]:[]),...(spec.levels.detail>0?[spec.detail]:[]),
    ...(spec.levels.texture>0?[spec.texture]:[]),...(spec.levels.bass>0?['round-bass']:[])])];
  return {
    presets:ids,
    profile:{id:spec.id,name:spec.name,description:spec.description,notes:spec.scale,tuning:440,
      leadRange:[55,76],detailRange:[55,76],space:spec.room,width:.4,tension:.2,
      lead:[spec.lead],detail:[spec.detail],body:[spec.base],
      phrase:{notes:[1,5],spacing:[.5,4],rest:[1,8],gate:[.4,4],attacksPerMinute:40,answerEvery:2,salience:0,beat:60/spec.tempo[0],swing:0},
      harmony:{chords:[[0,4,7]],hold:spec.chordBars,fade:2,voices:2},
      mix:{body:spec.levels.body,lead:spec.levels.lead,detail:spec.levels.detail,velocity:40,brightness:.18}},
    ensemble:{base:'chamber',foundationKind:spec.foundationKind,textureKind:'synth',counterKind:spec.counterKind,
      accompaniment:[spec.lead],bass:['round-bass'],texture:[spec.texture],counter:[spec.greeting],
      tempo:spec.tempo,meter:spec.meter,budget:80,
      levels:{accompaniment:0,bass:spec.levels.bass,texture:spec.levels.texture,percussion:0,counter:spec.levels.greeting}},
    explanation:[...spec.explanation,
      'Análisis cada 2 s: 3 s al 95 % y 8 s al 80 %, hasta ocho componentes; los porcentajes son objetivos, no garantías.',
      'Media absoluta y distribución espectral eligen la identidad en límites de frase. Los pesos son aportaciones al ajuste, no volúmenes ni indicadores biológicos.',
      'El saludo se detecta en los datos crudos, antes de Fourier; retira brevemente el primer plano y conserva el fondo.'],
    patch(preset,slot){
      const pad=slot==='foundation' && spec.foundationKind==='synth' || slot==='texture' || slot==='counter' && spec.counterKind==='synth';
      const echo=spec.id==='psychedelic' && (slot==='contour'||slot==='detail');
      return {preset,scale:`waves-${spec.id}`,notes:[...spec.scale],octaves:[2,6],tuning:440,
        velocity:{center:40,range:10},delay:{on:echo,wet:echo?24:0,rate:echo?57:70},
        chorus:{on:pad && spec.id==='psychedelic',depth:18,rate:4},
        reverb:{on:slot!=='bass',wet:spec.room,amount:spec.id==='sleep'?65:50},
        envelope:{on:true,attack:pad?spec.attack:12,release:pad?spec.release:24}};
    },
    create(){
      let bar=0,bpm=spec.tempo[0],tonic=0,referenceMean=0;
      let source:WaveFrame|null=null,motifSource:WaveFrame|null=null;
      let identity:ReturnType<typeof coordinates>|null=null,field:ReturnType<typeof musicalField>|null=null;
      let chord=[0,4,7],scale:number[]=[...spec.scale],voicing:number[]=[],clock=0;
      let tails:{start:number;end:number}[]=[];
      return {
        reset(){bar=0;bpm=spec.tempo[0];tonic=0;referenceMean=0;source=null;motifSource=null;identity=null;field=null;chord=[0,4,7];scale=[...spec.scale];voicing=[];clock=0;tails=[];},
        greet(event){return spec.greet(event,chord);},
        arrange(frame):WaveBar {
          const data=coordinates(frame),first=source===null;
          if(!referenceMean) referenceMean=frame.long.fit.mean;
          if(first || bar%spec.sectionBars===0 || source?.warmingUp && !frame.warmingUp && bar%spec.chordBars===0){source=frame;identity=data;tonic=[0,2,5,7,9][Math.min(4,Math.floor((data.mean*.7+data.speed*.3)*5))];scale=spec.scale.map(n=>wrap(n+tonic,12));}
          const selected=identity!;
          const target=spec.tempo[0]+(spec.tempo[1]-spec.tempo[0])*(data.mean*.7+data.speed*.3);
          if(first || bar%2===0) bpm=first?target:bpm+clamp(target-bpm,-1,1);
          if(first || bar%2===0){motifSource=frame;field=musicalField(frame.short);}
          if(first || bar%spec.chordBars===0){
            const route=spec.routes[Math.min(spec.routes.length-1,Math.floor(selected.width*spec.routes.length))];
            const degree=route[Math.floor(bar/spec.chordBars)%route.length];
            chord=(scale.length===5?[0,2,3]:[0,2,4]).map(n=>scale[(degree+n)%scale.length]);
            voicing=voiceLead(chord,voicing,48,67);
          }
          const notes:WaveNote[]=[],beat=60/bpm;
          const c:MoodContext={bar,phase:bar%spec.sectionBars,beat,bpm,meter:spec.meter,data,identity:selected,
            frame,source:source!,motifSource:motifSource!,field:field!,chord,scale,tonic,voicing,notes,
            add(at,slot,preset,midi,beats,velocity,rule,extra={}){
              const short=slot==='contour'||slot==='detail';
              const origin=short?motifSource!:source!;
              const pad=slot==='foundation'&&spec.foundationKind==='synth'||slot==='texture';
              notes.push({step:Math.round(at*4),slot,preset,midi,beats,velocity,rule,pan:0,color:.12+data.speed*.12,
                attack:pad?spec.attack:12,release:pad?spec.release:24,window:origin.warmingUp?'short':short?'short':'long',
                sourceFrame:origin,components:origin[origin.warmingUp?'short':short?'short':'long'].waves.map(w=>w.id),...extra});
            }};
          spec.arrange(c);
          // Pad overlaps are bounded across bars; reserve one voice for the raw greeting.
          tails=tails.filter(t=>t.end>clock);
          const accepted:WaveNote[]=[];let omitted=0;
          for(const n of notes.sort((a,b)=>a.step-b.step)){
            const start=clock+n.step/4*beat+(n.offset??0);
            const release=n.slot==='bass'?.12:.06+3.5*(n.release/100)**2;
            const end=start+n.beats*beat+release;
            const relevant=tails.filter(t=>t.start<end && t.end>start);
            const edges=[{at:start,d:1},{at:end,d:-1},...relevant.flatMap(t=>[{at:Math.max(start,t.start),d:1},{at:Math.min(end,t.end),d:-1}])].sort((a,b)=>a.at-b.at||a.d-b.d);
            let active=0,peak=0;for(const e of edges){active+=e.d;peak=Math.max(peak,active);}
            if(peak>spec.maxVoices-1 || accepted.length>=16){omitted++;continue;}
            tails.push({start,end});accepted.push(n);
          }
          const summary={version:1,style:spec.name,tonic,chord:chord.map(n=>['Do','Do♯','Re','Mi♭','Mi','Fa','Fa♯','Sol','La♭','La','Si♭','Si'][n]).join(' · '),
            key:`Centro ${['Do','Do♯','Re','Mi♭','Mi','Fa','Fa♯','Sol','La♭','La','Si♭','Si'][tonic]}`,bpm,tempoTarget:target,swing:0,
            phrase:Math.floor(bar/spec.sectionBars)+1,phase:`${bar%spec.sectionBars+1}/${spec.sectionBars}`,phraseBars:spec.sectionBars,
            arrangement:spec.description,base:spec.base,lead:spec.lead,detail:spec.detail,
            mean:frame.long.fit.mean,shortMean:frame.short.fit.mean,referenceMean,meanWindowSeconds:frame.long.fit.seconds,
            tempoMean:frame.long.fit.mean,tempoAnalysis:frame.id,activity:data.activity,spectralWidth:data.width,
            relativeVariation:frame.short.fittedRms/Math.max(1e-9,frame.short.fit.mean),
            harmonyAnalysis:source!.id,motifAnalysis:motifSource!.id,arrangementAnalysis:source!.id,motifRevision:Math.floor(bar/2)+1,
            attacks:accepted.length,melodyNotes:accepted.filter(n=>n.slot==='contour'||n.slot==='detail').length,
            layers:[...new Set(accepted.map(n=>n.slot))],omittedNotes:omitted,voiceLimit:spec.maxVoices,
            activityAnalysis:frame.id,sustain:true,breathing:!accepted.length,intro:!!source!.warmingUp,warmingUp:!!frame.warmingUp,
            motifPolicy:`Motivo cada dos compases; identidad cada ${spec.sectionBars}; armonía cada ${spec.chordBars}.`,
            shortExplained:frame.short.fit.explained,longExplained:frame.warmingUp?null:frame.long.fit.explained,
            restBeats:accepted.length?spec.meter-Math.max(...accepted.map(n=>n.step/4)):spec.meter,
            frequencyReference:field!.reference,musicalCycles:field!.components};
          clock+=spec.meter*beat;bar++;
          return {bpm,beats:spec.meter,stepsPerBeat:4,swing:0,notes:accepted,summary,
            expression:{brightness:spec.id==='sleep'?.08:.12+data.speed*.12,energy:.15+data.activity*.12,direction:spec.id==='psychedelic'?field!.cells[0].value*.3:0,
              bands:Array(9).fill(.35),space:.15,smoothing:spec.id==='sleep'?4:2}};
        },
      };
    },
  };
}
