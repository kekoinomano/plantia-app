import { defineMood, pitch } from './shared';

/** Audible, legato chamber ambient: a warm bed and a sparse piano breath. */
export const sleep = defineMood({
  id:'sleep',name:'Sleep',description:'Piano suave y colchón cálido de registro medio, con respiración y pausas entre frases.',
  tempo:[60,72],meter:4,sectionBars:8,chordBars:4,scale:[0,2,4,7,9],routes:[[0,0,3,0],[0,4,3,0]],
  routeIndex:identity=>identity.activity*.6+identity.width*.4>.38?1:0,
  base:'healing',lead:'pianoforte',detail:'pianoforte',texture:'sleep-halo',foundationKind:'synth',
  levels:{body:.32,lead:.28,detail:0,bass:0,texture:.12},room:24,attack:48,release:57,maxVoices:6,
  explanation:[
    'Cuatro pulsos lentos sin percusión: colchón legato en el centro audible y dos notas de piano separadas por silencios.',
    'Una armonía pentatónica abierta dura cuatro compases; cada ocho compases la planta puede cambiar centro tonal y recorrido.',
    'Las fluctuaciones pequeñas mueven acento, articulación y nota de paso; una media larga mayor cambia gradualmente el timbre del fondo al comienzo de frase.',
    'El saludo común usa bell tree. No se atribuyen efectos clínicos al tempo ni al timbre.',
  ],
  arrange(c){
    const breath=c.phase%4, active=c.data.activity>.52;
    const bed=c.identity.mean>.84?'sleep-halo':'healing';
    const root=pitch([c.tonic],55,49,59);
    const upper=pitch([c.chord[2]],62,57,66);
    c.add(0,'foundation',bed,root,breath===3?2.7:3.8,43+c.data.activity*5,
      'Pedal de registro medio: media larga elige timbre cálido o aireado por frase',{pan:-.11});
    if(breath!==3) c.add(0,'foundation',bed,upper,3.5,37+c.data.activity*4,
      'Quinta abierta; se retira al final de la frase para dejar espacio',{pan:.12});
    if(breath===0 || breath===2){
      const first=pitch([c.chord[1],c.chord[2]],64+c.field.cells[2].value*3,60,69);
      c.add(.5,'contour','pianoforte',first,1.35,40+c.data.activity*5,
        'Llamada de piano sobre nota estable, con aire antes y después',{attack:14,release:39});
      if(breath===2 && (active || c.field.cells[9].accent>.65))
        c.add(2.5,'contour','pianoforte',pitch([c.chord[0],c.chord[1]],62,59,67),1.1,38+c.data.activity*5,
          'Respuesta breve de piano: variación del contorno corto',{attack:14,release:40});
    }
    if(breath===3 && c.identity.persistence>.55 && c.identity.width>.32)
      c.add(1,'texture','sleep-halo',pitch([c.chord[1]],63,59,68),2.3,34,
        'Halo discreto al cierre: sólo si persiste una señal espectral amplia',{attack:55,release:55});
  },
});
