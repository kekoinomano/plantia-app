import { clamp, nearestPitch, wrap, type WaveFrame } from '../features';
import { signalDistance, voiceLead } from '../musical-field';
import type { WaveBar, WaveMood, WaveNote } from '../types';
import { LOFI_LANGUAGE as L, type LofiRole } from './lofi-language';
import { lofiCoordinates, LOFI_CALIBRATION, type LofiCalibration } from './lofi-mapping';
import { orchestrateLofi } from './lofi-occupancy';

const NAMES = ['Do','Do♯','Re','Mi♭','Mi','Fa','Fa♯','Sol','La♭','La','Si♭','Si'];
const ROLES: Record<LofiRole, string> = { theme: 'Tema', answer: 'Respuesta', keys: 'Armonía al frente', bass: 'Bajo al frente' };

/** New language-first engine. The factory allows the SAME rules to be evaluated
 * with candidate calibration ranges; recording names never enter composition. */
export function makeLofiMood(calibration: LofiCalibration = LOFI_CALIBRATION): WaveMood {
  return {
    presets: ['vibraphone','pianoforte','strumstick','round-bass','soft-kick','soft-snare','soft-hat'],
    profile: {
      id: 'lofi-waves', name: 'Lofi Ondas', description: 'Tres conjuntos cálidos, groove estable y frases guiadas por la planta.',
      notes: [0,2,3,5,7,9,10], tuning: 440, tonic: 2, leadRange: [60,72], detailRange: [60,72],
      space: 18, width: .35, tension: .25,
      lead: ['pianoforte'], detail: ['pianoforte'], body: ['vibraphone','pianoforte','strumstick'],
      phrase: { notes: [2,3], spacing: [.4,1.4], rest: [.4,2], gate: [.25,.9], attacksPerMinute: 100, answerEvery: 2, salience: 0, beat: 60/74, swing: .13 },
      harmony: { chords: [[0,3,7,10]], hold: 2, fade: .4, voices: 3 },
      mix: { body: L.mix.body, lead: L.mix.lead, detail: L.mix.detail, velocity: 46, brightness: .16 },
    },
    ensemble: {
      base: 'jazz', foundationKind: 'instrument', textureKind: 'synth', accompaniment: ['vibraphone'],
      bass: ['round-bass'], texture: ['peace'], tempo: [64,86], meter: 4, budget: 240,
      levels: { accompaniment: 0, bass: L.mix.bass, texture: 0, percussion: L.mix.drums },
    },
    explanation: [
      'El vocabulario se define antes del mapeo: vibráfono suave, piano íntimo o strumstick. Cada conjunto tiene una base y un solista compatibles; no se sortean instrumentos independientes.',
      'Dos ajustes cada 2 s: ventana corta de 3 s al 95 % y larga de 8 s al 80 %, hasta ocho ondas. La introducción usa sólo la ventana corta completa y se identifica como tal.',
      'La media absoluta participa en el tempo y la familia de acompañamiento; la distribución ponderada de frecuencias elige armonía y groove. La variación regula la dinámica. El piano desarrolla las notas de ese acorde, sin convertir cada onda en notas aisladas.',
      'La base puede acompañar al solista: registros separados, acordes de séptima sin clusters y volumen subordinado. Una sola línea melódica, máximo cinco voces afinadas, caídas incluidas. La batería conserva el pulso cuando descansa la melodía.',
      'La identidad se retiene ocho compases y se puede adaptar a los cuatro ante un cambio grande. El piano repite un motivo de dos compases: pregunta, respuesta y resolución en la tercera del acorde.',
      'La media corta, larga e inicial se conservan en memoria con sus análisis. Los rangos se contrastan con los cuatro registros de datasamples; no son calibración biológica ni garantía para todos los circuitos.',
      'Piano acústico en registro medio, acompañado por dos voces más graves y discretas. La respuesta termina más suave y sostenida; el bajo redondo mantiene su patrón.',
      'El saludo común detecta un extremo relativo antes de Fourier y usa bell tree. Retira brevemente al solista; no se acumula con otras respuestas.',
    ],
    patch(preset, slot) {
      const dry = slot === 'bass' || slot === 'percussion';
      return { preset, scale: 'wave-lofi-resolved-piano-v12', notes: [0,2,3,5,7,9,10], octaves: [2,6], tuning: 440,
        velocity: { center: 46, range: 16 }, delay: { on: false, wet: 0, rate: 73 },
        chorus: { on: false, depth: 0, rate: 5 },
        reverb: { on: !dry, wet: 12, amount: 35 },
        envelope: { on: true, attack: 7, release: dry ? 8 : 20 } };
    },
    create() {
      let barNumber = 0, bpm = 74, initialMean = 0, previousTop = 65;
      let sceneFrame: WaveFrame | null = null;
      let state: ReturnType<typeof lofiCoordinates> | null = null;
      let voicing: number[] = [], lastTones = [2,5,9,0], tonic = 2;
      const reset = () => { barNumber=0; bpm=74; initialMean=0; previousTop=65; sceneFrame=null;
        state=null; voicing=[]; lastTones=[2,5,9,0]; tonic=2; };
      return {
        reset,
        arrange(frame): WaveBar {
          const measured = lofiCoordinates(frame, calibration), first = state === null, phase=barNumber%8;
          if (!initialMean) initialMean=frame.long.fit.mean;
          const change=sceneFrame ? signalDistance(frame.long,sceneFrame.long) : 1;
          if (first || phase===0 || phase===4 && (change>.45 || sceneFrame?.warmingUp && !frame.warmingUp)) {
            // Quantized choices persist for the entire section; small movements
            // may express themselves without continuously switching instruments.
            state=measured; sceneFrame=frame;
            tonic=L.keys[state.key];
          }
          const selected=state!, source=sceneFrame!;
          if (first || phase%2===0) bpm=first ? clamp(measured.tempo,64,86)
            : bpm+clamp(clamp(measured.tempo,64,86)-bpm,-2,2);
          const scene=L.scenes[selected.scene];
          const harmony=L.harmony[selected.mode], route=harmony.routes[selected.route];
          const scale=harmony.scale.map(n=>wrap(n+tonic,12));
          const degree=route[Math.floor(phase/2)], tones=[0,2,4,6].map(n=>scale[(degree+n)%7]);
          lastTones=tones;
          voicing=voiceLead(tones.slice(1),voicing,53,65);
          const chordName=`${NAMES[tones[0]]}${wrap(tones[1]-tones[0],12)===3 ? 'm7' : wrap(tones[3]-tones[0],12)===11 ? 'maj7' : '7'}`;
          const role=L.forms[selected.form][phase], lead=role==='theme'||role==='answer';
          const groove=L.grooves[selected.groove], swing=groove.swing;
          const variation=measured.variation;
          const quiet=measured.relative<.00002, intro=!!source.warmingUp;
          const notes: WaveNote[]=[];
          const emit=(step:number,slot:string,preset:string,midi:number,velocity:number,beats:number,rule:string,
            origin:WaveFrame=source, window:'short'|'long'='long', extra:Partial<WaveNote>={})=> {
            const actual=origin.warmingUp ? 'short' : window;
            notes.push({step,slot,preset,midi,velocity,beats,rule,window:actual,sourceFrame:origin,
              components:origin[actual].waves.map(w=>w.id),pan:0,color:scene.color,attack:7,release:20,...extra});
          };
          if (!quiet) {
            // Accepted piano audition: derive the melody and its lower shell together.
            // Keep voice-leading memory separate from the source chord voicing.
            const top=nearestPitch([tones[1]],previousTop,60,71);
            previousTop=top;
            const shell=[...new Set(voicing.map(n=>n>=top-2?n-12:n))]
              .filter(n=>n>=48 && n<top-2).slice(0,2);
            const dynamic=Math.min(3,variation*3), beat=60/bpm;
            shell.forEach((midi,i)=>emit(0,'foundation',scene.base,midi,27-i+dynamic,2.2,
              'Base: dos voces graves y discretas bajo el motivo de piano',source,'long',
              {offset:i*.014*beat,pan:0,attack:8,release:22}));
            const upper=nearestPitch([tones[2]],top+3,60,72);
            const phrase=barNumber%2===0 ? L.resolvedMotif.question : L.resolvedMotif.answer;
            for (const [at,useFifth,gate,velocity] of lead ? phrase : []) {
              // The clock adds swing on half-beat offbeats. Only the central
              // 1.5-beat note is swung in the accepted two-bar phrase.
              const desired=at+(at===1.5?swing/2:0);
              const clockSwing=Math.floor(at*2)%2?swing/2:0;
              emit(at*4,'contour',L.solo.preset,useFifth?upper:top,velocity+dynamic,gate,
                barNumber%2===0?'Piano: pregunta sobre tercera y quinta':'Piano: respuesta y resolución sostenida en la tercera',
                source,'long',{offset:(desired-at-clockSwing)*beat,pan:0,attack:8,release:22});
            }
            if(role==='keys') {
              emit(8,'contour',L.solo.preset,top,34+dynamic,1.25,
                'Relevo de teclado: una nota aislada del acorde durante el descanso del tema',source,'long',
                {pan:.07,attack:8,release:20});
            }
            const bass=nearestPitch([tones[0]],38+selected.mean*4,33,45);
            emit(0,'bass','round-bass',bass,47+variation*7,1.2,'Bajo: raíz y ancla del compás',source,'long',{release:8});
            if (!lead || selected.groove===1) {
              // One bass voice: more audible answers in spaces left by the lead.
              const replyDegree = selected.width > .28 ? tones[1] : tones[2];
              emit(8,'bass','round-bass',nearestPitch([replyDegree],bass+4,33,48),
                (role==='bass'?49:44)+variation*5,role==='bass'?1.4:1.1,
                'Bajo: respuesta de tercera o quinta según anchura espectral; protagonismo sin solista',source,'long',{release:8});
            }
            const pattern=phase%2;
            for (const step of groove.kicks[pattern]) emit(step,'percussion','soft-kick',36,44+variation*7-(step?4:0),.18,
              'Bombo: patrón estable de dos compases',source,'short',{attack:0,release:3});
            for (const step of [4,12]) emit(step,'percussion','soft-snare',38,32+variation*6,.12,
              'Caja: dos y cuatro con pequeño retraso compartido',source,'short',{offset:.014,release:3});
            if (!intro) for (const [i,step] of groove.hats[pattern].entries()) emit(step,'percussion','soft-hat',42,
              21+variation*4-(i%2?4:0),.07,'Hat: contratiempo con dinámica alternada',source,'short',{pan:-.18,release:2});
          }
          const occupancy=orchestrateLofi(notes,bpm,swing,{allowHarmonyUnderLead:true,preserveArticulation:true});
          const plan=occupancy.notes;
          const summary={version:L.version, tonic, phrase:Math.floor(barNumber/8)+1,phase:barNumber%2===0?'Pregunta':'Resolución',role:barNumber%2===0?'theme':'answer',bassRole:ROLES[role],scene:scene.id,style:scene.name,
            chord:chordName,key:`${NAMES[tonic]} · ${harmony.name}`,route:[...route],bpm,swing,tempoTarget:clamp(measured.tempo,64,86),
            activity:variation,relativeVariation:measured.relative,speed:measured.speed,spectralWidth:measured.width,
            spectralBands:measured.bands,signalChange:change,evolution:change,quiet,intro,warmingUp:!!frame.warmingUp,
            mean:frame.long.fit.mean,shortMean:frame.short.fit.mean,referenceMean:initialMean,meanWindowSeconds:frame.long.fit.seconds,
            tempoMean:frame.long.fit.mean,tempoAnalysis:frame.id,lead:scene.lead,detail:scene.lead,base:scene.base,
            motifAnalysis:source.id,harmonyAnalysis:source.id,arrangementAnalysis:source.id,motifRevision:Math.floor(barNumber/2)+1,motifSteps:(barNumber%2===0?L.resolvedMotif.question:L.resolvedMotif.answer).map(n=>n[0]*4),
            phraseRoles:['Pregunta','Resolución'],phraseBars:2,voicing,
            layers:[...new Set(plan.map(n=>n.slot))],attacks:plan.length,melodyNotes:plan.filter(n=>n.slot==='contour'||n.slot==='detail').length,
            voiceSchedule:occupancy.schedule,peakPitchedVoices:occupancy.peakPitchedVoices,shortenedNotes:occupancy.shortened,omittedNotes:occupancy.omitted,
            arrangement:'Piano con motivo resuelto y dos voces de acompañamiento graves',
            overlapPolicy:'compatible-harmony-and-one-lead; maximum-five-pitched-voices',
            restBeats:plan.length ? 4-Math.max(...plan.map(n=>n.step/4)) : 4,
            interpretation:'chord-derived-resolved-piano-motif',calibration,shortExplained:frame.short.fit.explained,longExplained:frame.warmingUp?null:frame.long.fit.explained};
          barNumber++;
          return {bpm,beats:4,stepsPerBeat:4,swing,swingUnit:2,notes:plan,summary,
            expression:{brightness:.12+measured.speed*.06,energy:.2+variation*.1,direction:0,bands:Array(9).fill(.4),space:.2,smoothing:1.2}};
        },
      };
    },
  };
}
export const lofiWaves=makeLofiMood();
