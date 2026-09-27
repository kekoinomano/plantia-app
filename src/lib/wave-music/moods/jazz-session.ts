import { defineMood, pitch } from './shared';

const ROUTES: readonly (readonly number[])[] = [
  [1,4,0,5,1,4,0,4], // ii–V–I–vi, then a turnaround
  [0,5,1,4,3,4,0,4],
  [1,4,2,5,1,4,0,4],
];
const routeIndex=(identity:{width:number;activity:number})=>
  Math.min(2,Math.floor((identity.width*.6+identity.activity*.4)*3));

/** Small jazz combo: walking bass, swung timekeeping, shell comping and sax/vibes trading. */
export const jazzSession = defineMood({
  id:'jazz-session',name:'Jazz Session',
  description:'Sesión de saxo tenor, piano y vibráfono con bajo caminante, swing y conversación improvisada.',
  tempo:[94,114],meter:4,sectionBars:8,chordBars:1,scale:[0,2,4,5,7,9,11],
  routes:ROUTES,routeIndex,chordSteps:[0,2,4,6],swing:.26,
  base:'piano-expresivo',lead:'tenor-saxophone',detail:'vibraphone',texture:'peace',
  foundationKind:'instrument',textureKind:'synth',baseKind:'jazz',
  drums:['soft-hat','soft-snare'],
  levels:{body:.19,lead:.25,detail:.14,bass:.27,texture:0,percussion:.16},
  room:12,attack:7,release:22,maxVoices:12,
  explanation:[
    'Una forma de ocho compases utiliza ii–V–I y turnarounds. Cada acorde lleva séptima; el piano acompaña con tercera y séptima en un lugar sincopado, dejando el bajo libre.',
    'El bajo camina por raíz, acorde y aproximación cromática al acorde siguiente. El swing desplaza las corcheas débiles; hat suave y caja fantasma sostienen el tiempo sin ocupar el solo.',
    'El saxo tenor desarrolla motivos de dos compases: terceras y séptimas enlazan los cambios y las notas de paso se ligan a la siguiente sin cortar el aire. Las respiraciones quedan al final de la frase; el vibráfono responde al final de cada media frase.',
    'La media y frecuencia ponderada de las ondas largas fijan centro y tempo; anchura y actividad larga escogen la ruta. Una variación grande cambia el marco al inicio de una frase.',
    'La persistencia larga determina cuánto camina el bajo y cuán ligada queda la frase; las ondas cortas ponderadas matizan acentos, aproximación y comping. El pulso y las funciones armónicas siguen siendo reconocibles.',
  ],
  arrange(c){
    const phase=c.phase, root=c.chord[0], degree=c.scale.indexOf(root);
    const route=ROUTES[routeIndex(c.identity)];
    const nextDegree=route[(c.bar+1)%route.length];
    const nextRoot=c.scale[nextDegree];
    const cell=c.field.cells[(phase*2)%16], reply=c.field.cells[(phase*2+7)%16];
    const twoFeel=(phase===0 || phase===4) && c.identity.persistence<.45;

    const bassRoot=pitch([root],41,35,49);
    const walk=[bassRoot,
      pitch([c.chord[phase%2?2:1]],43,36,50),
      pitch([c.chord[phase%2?3:2]],44,36,51),
      Math.max(35,Math.min(50,pitch([nextRoot],43,36,50)+(cell.value>=0?-1:1)))];
    for(const beat of twoFeel?[0,2]:[0,1,2,3])
      c.add(beat,'bass','round-bass',walk[beat],twoFeel?1.65:.78,
        43+c.data.activity*5+(beat===0?3:0)+cell.value*2,
        beat===3?'Bajo caminante: aproximación cromática al siguiente acorde':'Bajo caminante: raíz y notas del acorde de séptima',
        {attack:3,release:9,pan:-.12,chromatic:beat===3});

    const compAt=phase%2===0?1.5:.5;
    [c.chord[1],c.chord[3]].forEach((tone,i)=>c.add(compAt,'foundation','piano-expresivo',
      pitch([tone],i?63:58,53,69),.7+c.identity.persistence*.16,
      29+i*2+c.data.activity*4+cell.value*3,
      'Comping de piano: tercera y séptima conducen las voces entre acordes',
      {attack:7,release:20,pan:i?.08:-.08}));

    const guideRoles=[1,3,1,3,3,1,3,1];
    const guide=pitch([c.chord[guideRoles[phase]]],65+Math.round(c.identity.width*3),59,72);
    const available=Array.from({length:19},(_,i)=>58+i).filter(n=>c.scale.includes(n%12));
    const guideIndex=available.indexOf(guide);
    const direction=c.origin.activity>.48?-1:1;
    const scaleStep=(steps:number)=>available[Math.max(0,Math.min(available.length-1,guideIndex+steps))];
    const saxPhrases=[
      [[.5,0,.7,0],[1.5,1,.3,1],[2,2,.32,1],[2.75,1,.8,0]],
      [[.25,0,.7,0],[1.25,-1,.3,1],[1.75,0,.32,1],[2.5,1,1,0]],
      [[.75,0,.85,0],[2,1,.3,1],[2.5,0,1.3,0]],
      [],
      [[.25,0,.7,0],[1,-1,.3,1],[1.5,-2,.3,1],[2.25,-1,.3,1],[2.75,0,.9,0]],
      [[.5,0,.7,0],[1.5,1,.3,1],[2,2,.32,1],[2.5,0,1,0]],
      [[.25,0,.75,0],[1.25,-1,.3,1],[1.75,0,.32,1],[2.5,1,1.25,0]],
      [],
    ] as const;
    const saxNotes=saxPhrases[phase].map(([at,step,beats,passing],i)=>{
      const ornament=i===1 && Math.abs(reply.value)>.35 ? (reply.value>0?1:-1) : 0;
      const moved=step*direction+ornament;
      const midi=scaleStep(step!==0 && moved===0 ? step*direction : moved);
      return {at,beats,passing,midi};
    });
    saxNotes.forEach((note,i)=>{
      const next=saxNotes[i+1];
      const linked=!!next;
      const beats=next ? next.at-note.at+(next.midi===note.midi?-.03:.08) :
        note.beats+c.identity.persistence*.12;
      c.add(note.at,'contour','tenor-saxophone',note.midi,beats,
        (note.passing?46:54)+(i===0?8:0)+c.data.activity*8+cell.value*4,
        linked?'Saxo: nota ligada a la siguiente sin respiración intermedia':
          'Saxo: nota guía y respiración al terminar la frase',
        {attack:4,release:linked?12:18,pan:reply.value*.1});
    });
    if(phase===3 || phase===7){
      c.add(.75,'detail','vibraphone',scaleStep(0),.58,42+c.data.activity*5,
        'Vibráfono: respuesta a la frase de saxofón',{attack:7,release:24});
      c.add(2.25,'detail','vibraphone',scaleStep(direction),.72,39+c.data.activity*5,
        'Vibráfono: cierre de la respuesta',{attack:7,release:24});
      if(phase===7 && c.identity.width>.32)
        c.add(3,'contour','tenor-saxophone',guide,.72,
          48+c.data.activity*5,'Saxo: remate de la forma sobre la nota guía',{attack:4,release:18});
    }

    for(const [i,at] of [0,1.5,2,3.5].entries())
      c.add(at,'percussion','soft-hat',42,.08,18+(i===0?4:0)+c.data.activity*4,
        'Tiempo swing de plato ligero: negras y anticipaciones de corchea',{attack:0,release:2,pan:.16});
    if(phase%2===1)
      c.add(2.5,'percussion','soft-snare',38,.1,18+c.data.activity*5,
        'Caja fantasma: comentario rítmico, no backbeat de rock',{attack:0,release:3,pan:-.1});
  },
});
