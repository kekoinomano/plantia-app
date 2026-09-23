import { chordGesture, defineMood, pitch } from './shared';

/** No clinical claim: quiet continuity, low contrast and slow harmonic motion. */
export const sleep = defineMood({
  id:'sleep',name:'Sleep',description:'Dos voces cálidas continuas, cambios muy lentos y un halo ocasional sin golpes.',
  tempo:[60,72],meter:8,sectionBars:16,chordBars:8,scale:[0,2,4,7,9],routes:[[0,0,3,0],[0,4,0,3]],
  base:'sleep-air',lead:'pan-flute',detail:'pan-flute',texture:'sleep-halo',greeting:'sleep-halo',foundationKind:'synth',counterKind:'synth',
  levels:{body:.2,lead:0,detail:0,bass:0,texture:.08,greeting:.12},room:30,attack:98,release:82,maxVoices:5,
  explanation:[
    'El reloj interno está entre 60 y 72 BPM pero no se oye una batería. Cada unidad contiene ocho tiempos: el movimiento perceptible es mucho más lento.',
    'Dos voces de espectro suave y registro medio-grave, sin campanas ni piano percutido. La armonía permanece ocho unidades; el halo sólo aparece una vez cada cuatro.',
    'La planta modifica timbre, dinámica estrecha y trayectoria pentatónica. Una señal más activa no aumenta la densidad ni dispara acentos fuertes.',
    'El saludo es una elevación suave del halo afinado, no una alarma. Este diseño no promete inducir sueño ni efectos fisiológicos.',
  ],
  arrange(c){
    const root=pitch([c.chord[0]],48,43,55), fifth=pitch([c.chord[2]],55,50,62);
    [root,fifth].forEach((n,i)=>c.add(0,'foundation','sleep-air',n,7.1,27+c.data.activity*2-i*3,
      'Continuidad: voces lentas, dinámica limitada y colas compartidas',{pan:i?.08:-.08}));
    if(c.bar%4===2 && c.identity.persistence>.35)
      c.add(3,'texture','sleep-halo',pitch([c.chord[1]],60,55,64),3.5,22,
        'Halo ocasional: persistencia de la ventana larga, sin aumentar densidad con actividad',{attack:98,release:72});
  },
  greet:(event,chord)=>chordGesture('sleep-halo',27,96,55,event,chord,1.8),
});
