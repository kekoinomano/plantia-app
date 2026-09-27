import { defineMood, pitch } from './shared';

/** Modal centre and two unequal cells, with bounded real DSP echoes. */
export const psychedelic = defineMood({
  id:'psychedelic',name:'Psicodélico',description:'Pedal modal, figuras de tres y cinco pasos y ecos que cambian de posición lentamente.',
  tempo:[62,88],meter:4,sectionBars:16,chordBars:16,scale:[0,2,4,6,7,9,11],routes:[[0],[0]],
  base:'prism-pedal',lead:'dan-tranh',detail:'vibraphone',texture:'liquid-nebula',foundationKind:'synth',
  levels:{body:.19,lead:.2,detail:.12,bass:.18,texture:.08},room:23,attack:78,release:55,maxVoices:7,
  explanation:[
    'Psicodelia modal: un centro estable permite percibir cambios de fase, timbre y espacio sin cambiar continuamente de acorde.',
    'Dan tranh sobre una célula de tres pasos y respuesta de vibráfono de cinco. Comparten pulso; su relación se desplaza a lo largo de los compases.',
    'El campo ponderado de ondas decide dirección y posición estéreo. Anchura espectral habilita la segunda figura; persistencia mantiene el pedal.',
    'Delay real del motor, mezcla limitada y sin realimentación extra. Las capas entran en turnos; no se simulan inversión de cinta ni efectos inexistentes.',
  ],
  arrange(c){
    [c.tonic,(c.tonic+7)%12].forEach((pc,i)=>{
      if(c.phase%8===7 && i) return;
      c.add(0,'foundation','prism-pedal',pitch([pc],48+i*7,43,62),c.phase%8===7?2.5:3.6,29-i*3,
        'Pedal modal: la quinta descansa al final de cada semifrase',{pan:i?.2:-.2});
    });
    const cell=[0,2,1], palette=[c.tonic,(c.tonic+4)%12,(c.tonic+7)%12,(c.tonic+9)%12];
    const direction=c.field.cells[4].motion>=0?1:-1;
    const breath=c.phase%8===7;
    (breath?[0.5]:[0.5,2]).forEach((at,i)=>{
      const index=((c.bar*2+i)*direction%3+3)%3;
      c.add(at+(c.data.activity>.55 && i===1?.25:0),'contour','dan-tranh',
        pitch([palette[cell[index]]],62+c.identity.mean*5,57,72),.7,37+c.data.activity*6-i*2,
        'Célula de tres: dirección del campo ponderado, alturas del modo estable',{pan:c.field.cells[i*8].value*.4,release:24});
    });
    if((c.identity.width>.12 || c.identity.activity>.55) && c.bar%4!==3 && !breath){
      const index=(c.bar*2+1)%5, answer=[0,2,1,3,1][index];
      c.add(3,'detail','vibraphone',pitch([palette[answer]],68,60,74),.55,29+c.data.activity*3,
        'Respuesta de cinco: anchura espectral permite la segunda figura',{pan:-c.field.cells[8].value*.4,release:20});
    }
    if(c.bar%8===4 && (c.identity.width>.5 || c.identity.activity>.6))c.add(1,'texture','liquid-nebula',pitch([c.chord[1]],60,55,67),2,23,
      'Color sostenido ocasional: sólo espectros anchos, por debajo de las figuras',{attack:85,release:45});
    if(c.bar%4===0)c.add(0,'bass','round-bass',pitch([c.tonic],38,33,45),1.6,39,'Bajo: ancla del centro modal',{release:8});
  },
});
