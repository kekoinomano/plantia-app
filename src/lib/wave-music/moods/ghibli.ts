import { chordGesture, defineMood, pitch } from './shared';

/** Original chamber miniature: lyrical question/answer, not film quotations. */
export const ghibli = defineMood({
  id:'ghibli',name:'Studio Ghibli',description:'Piano de cámara en tres tiempos, una melodía con destino y respuestas delicadas de madera.',
  tempo:[76,108],meter:3,sectionBars:8,chordBars:2,scale:[0,2,4,5,7,9,11],routes:[[0,5,3,4],[0,3,1,4]],
  base:'pianoforte',lead:'pianoforte',detail:'pan-flute',texture:'sleep-air',greeting:'pianoforte',foundationKind:'instrument',
  levels:{body:.22,lead:.27,detail:.18,bass:.18,texture:0,greeting:.24},room:18,attack:10,release:26,maxVoices:5,
  explanation:[
    'Miniatura original de cámara: piano, bajo discreto y madera que responde; no se reproducen melodías de películas.',
    'Tres tiempos, arpegio grave y una frase de ocho compases. Pregunta, desarrollo, respuesta y cadencia tienen funciones distintas.',
    'La media elige registro y tempo; anchura espectral elige recorrido armónico. El contorno ponderado decide si la pregunta sube o baja; la cadencia vuelve a una nota del acorde.',
    'La flauta toma el relevo del piano melódico en la respuesta, sin duplicarlo. Las notas de tercera y quinta construyen el motivo; la cadencia deja un tiempo de respiración.',
  ],
  arrange(c){
    const phase=c.bar%8,third=pitch([c.chord[1]],65+c.identity.mean*3,60,72),fifth=pitch([c.chord[2]],third+3,60,76);
    const inner=[pitch([c.chord[1]],52,48,59),pitch([c.chord[2]],57,50,62)];
    inner.forEach((n,i)=>c.add(1+i,'foundation','pianoforte',n,.65,29+c.data.activity*3-i*2,
      'Acompañamiento en tres: voces interiores por debajo de la melodía',{release:18}));
    c.add(0,'bass','round-bass',pitch([c.chord[0]],43,36,48),1.25,37+c.data.activity*3,'Raíz en el primer tiempo',{release:8});
    const response=phase>=4&&phase<=5&&c.identity.width>.2;
    const preset=response?'pan-flute':'pianoforte',slot=response?'detail':'contour';
    const reverse=c.field.cells[8].value<c.field.cells[0].value;
    const tones=reverse?[fifth,third]:[third,fifth];
    if(phase===7){
      c.add(0,slot,preset,pitch([c.chord[0]],third,60,72),2,37,'Cadencia: llegada al acorde y un tiempo de respiración',{attack:response?26:8,release:22});
    }else{
      const phrase=c.bar%2===0?[[0,tones[0],.8],[1,tones[1],.6],[2,third,.55]]:[[0,fifth,.8],[1,third,1.2]];
      phrase.forEach(([at,n,duration],i)=>c.add(at,slot,preset,n,duration,42+c.data.activity*4-i*3,
        response?'Madera: respuesta que resuelve en la tercera':'Piano: motivo sobre tercera y quinta, resolución compartida',
        {attack:response?26:8,release:18}));
    }
  },
  greet(event,chord){
    return {holdSeconds:1.2,notes:[0,1].map(i=>({after:i*.35,duration:i?.45:.18,slot:'counter',preset:'pianoforte',
      midi:pitch([chord[i?1:0]],i?69:65,60,74),velocity:45-i*5,color:.15,pan:0,attack:8,release:12,
      rule:'Saludo: dos notas de piano afinadas en el acorde, como una pequeña llamada'}))};
  },
});
