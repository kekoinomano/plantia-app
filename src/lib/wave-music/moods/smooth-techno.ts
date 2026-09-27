import { defineMood, pitch } from './shared';

/** Warm dub techno: a steady floor, syncopated low end and evolving synthetic stabs. */
export const smoothTechno = defineMood({
  id:'smooth-techno',name:'Smooth Techno',
  description:'Techno dub cálido con pulso firme, acordes sintéticos con eco y bajo sincopado.',
  tempo:[112,122],meter:4,sectionBars:8,chordBars:2,scale:[0,2,3,5,7,9,10],chordSteps:[0,2,4,6],
  routes:[[0,0,3,0],[0,6,0,3],[0,0,4,6]],
  routeIndex:identity=>Math.min(2,Math.floor((identity.width*.55+identity.activity*.45)*3)),
  base:'techno-stab',lead:'techno-pulse',detail:'techno-pulse',texture:'techno-haze',
  foundationKind:'synth',textureKind:'synth',baseKind:'pulse',chordDelay:true,
  drums:['soft-kick','soft-snare','soft-hat'],
  levels:{body:.21,lead:.2,detail:.1,bass:.28,texture:.08,percussion:.29},
  room:11,attack:75,release:42,maxVoices:16,
  explanation:[
    'El bombo marca cuatro negras y el bajo contesta entre golpes. Caja en dos y cuatro y hats a contratiempo forman un ciclo reconocible sin swing excesivo.',
    'Acordes sintéticos cortos de tercera y séptima se repiten en síncopa; el delay real del motor prolonga el gesto. Un motivo electrónico reducido evoluciona en cuatro compases y deja espacio al eco.',
    'El modo dórico mantiene un centro menor cálido. La identidad de las ondas largas elige la ruta de ocho compases, la familia rítmica y el contorno; cambios grandes pueden renovar el marco al inicio de una frase.',
    'La media larga decide el centro y el objetivo de tempo, la persistencia regula la duración del fondo y las ondas cortas ponderadas mueven acentos y alguna nota de paso sin deshacer el pulso.',
    'El último compás deja caer parte de la batería y las capas melódicas para que el regreso del ciclo resulte perceptible.',
  ],
  arrange(c){
    const phase=c.phase, root=c.chord[0], degree=c.scale.indexOf(root);
    const cell=c.field.cells[(phase*2)%16], answer=c.field.cells[(phase*2+5)%16];
    const family=c.origin.width>.42?2:c.origin.mean>.5?1:0;
    const breakBar=phase===7;

    for(const at of breakBar?[0,2]:[0,1,2,3])
      c.add(at,'percussion','soft-kick',36,.12,51+(at===0?5:0)+c.data.activity*5,
        'Bombo a negras: ancla estable del ciclo techno',{attack:0,release:3});
    for(const at of breakBar?[1]:[1,3])
      c.add(at,'percussion','soft-snare',38,.09,34+(at===3?2:0)+c.data.activity*4,
        'Caja en dos y cuatro; el final de frase deja un hueco',{attack:0,release:3,pan:.06});
    for(const at of breakBar?[.5,2.5]:[.5,1.5,3.5])
      c.add(at,'percussion','soft-hat',42,.07,26+c.data.activity*5+cell.accent*3,
        'Hat a contratiempo: onda corta matiza el acento',{attack:0,release:2,pan:-.12});

    const bass=pitch([root],39,35,46);
    const bassAt=[[.75,2.75],[.5,2.5],[1.5,3.25]][family];
    c.add(bassAt[0],'bass','round-bass',bass,.43+c.identity.persistence*.09,
      46+c.data.activity*6+cell.value*3,
      'Bajo sincopado: raíz fuera del golpe de bombo',{attack:3,release:7});
    if(!breakBar)c.add(bassAt[1],'bass','round-bass',
      pitch([phase%4===3?c.chord[2]:root],41,36,48),.38,
      41+c.data.activity*5+answer.value*3,
      'Respuesta del bajo: raíz o quinta antes del siguiente pulso',{attack:3,release:7});

    if(!breakBar && phase!==3){
      const at=family===1?2.5:1.5;
      [c.chord[1],c.chord[3]].forEach((tone,i)=>c.add(at,'foundation','techno-stab',
        pitch([tone],i?63:58,54,67),.27+c.identity.persistence*.07,
        48-i*3+c.data.activity*5+cell.value*3,
        'Acorde dub: tercera y séptima en contratiempo con eco rítmico',
        {attack:4,release:15,pan:i?.12:-.12}));
    }
    if(phase===0 || phase===4)
      c.add(0,'texture','techno-haze',pitch([root],51,46,56),
        5+c.identity.persistence*1.2,24+c.data.activity*4,
        'Fondo de inicio de semifrase: la persistencia larga decide su cola',
        {attack:77,release:40,pan:-.18});

    const patterns=[[[.75,0],[2.5,2]],[[.5,2],[2.75,0]],[[1.25,1],[3.25,3]]] as const;
    const motif=patterns[family];
    const shape=[0,1,2,1];
    const count=breakBar?1:phase===3?1:phase%4===2 && c.data.activity>.4?3:2;
    for(let i=0;i<count;i++){
      const [at,offset]=i<2?motif[i]:[3.5,1] as const;
      const bend=i===count-1 && Math.abs(answer.value)>.38?(answer.value>0?1:-1):0;
      const tone=c.scale[(degree+offset+shape[phase%4]+bend+c.scale.length*2)%c.scale.length];
      c.add(at,'contour','techno-pulse',pitch([tone],66+family*2,61,75),
        i===count-1?.36:.25,47+c.data.activity*7+(i===0?4:-2)+cell.value*4,
        'Motivo electrónico: identidad larga fija ritmo y forma; onda corta altera el cierre',
        {attack:4,release:13,pan:cell.value*.12});
    }
    if(breakBar && c.identity.width>.35)
      c.add(3.5,'detail','techno-pulse',pitch([root],72,65,77),.18,
        35+answer.accent*4,'Anacrusa breve al regreso del ciclo',{attack:4,release:12});
  },
});
