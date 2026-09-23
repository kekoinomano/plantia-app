import { chordGesture, defineMood, pitch } from './shared';

/** Sparse ambient chamber: repetition supplies continuity, not a drum beat. */
export const deepFocus = defineMood({
  id:'deep-focus',name:'Deep focus',description:'Fondo suspendido y un motivo de teclas discreto que respira entre repeticiones.',
  tempo:[48,66],meter:4,sectionBars:8,chordBars:4,scale:[0,2,4,7,9],routes:[[0,3,4,0],[0,4,2,0]],
  base:'healing',lead:'electric-piano',detail:'pianoforte',texture:'sleep-air',greeting:'electric-piano',foundationKind:'synth',
  levels:{body:.22,lead:.19,detail:.13,bass:0,texture:0,greeting:.19},room:24,attack:85,release:60,maxVoices:6,
  explanation:[
    'Ambient de concentración: fondo sin percusión, armonía pentatónica y una célula pequeña que reaparece; no se busca reclamar atención con solos.',
    'La media y frecuencia geométrica eligen 48–66 BPM internos. Anchura espectral elige recorrido armónico; la onda dominante tiene más peso en el contorno agregado.',
    'Dos voces de fondo con entradas lentas; teclas en compases alternos. Un espectro ancho permite una respuesta de piano en lugar de las teclas, nunca ambos solistas.',
  ],
  arrange(c){
    const {bar,chord,data,identity,field}=c;
    [pitch([chord[0]],48,43,55),pitch([chord[2]],57,50,62)].forEach((n,i)=>
      c.add(0,'foundation','healing',n,3.65,30-i*3,'Fondo pentatónico: dos voces lentas que enlazan compases',{pan:i?.12:-.12}));
    if(bar%2===0){
      const reverse=field.cells[8].value<field.cells[0].value;
      const voice=identity.width>.35 && bar%8===6?'pianoforte':'electric-piano';
      const tones=reverse?[chord[2],chord[1]]:[chord[1],chord[2]];
      [1,2.5].forEach((at,i)=>c.add(at,'contour',voice,pitch([tones[i]],62,57,69),.85,34+data.activity*3-i*3,
        'Motivo de dos notas del acorde; dirección del campo ponderado, reposo el siguiente compás',{release:28}));
    }
  },
  greet:(event,chord)=>chordGesture('electric-piano',39,20,28,event,chord,.65),
});
