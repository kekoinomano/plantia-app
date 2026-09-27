import { defineMood, pitch } from './shared';

/** An original slow-moving soundscape inspired by the sustained tonal field in space.mp3. */
export const space = defineMood({
  id:'space',name:'Space',description:'Horizonte de acordes suspendidos, pulsos tenues y destellos que responden a la planta.',
  tempo:[58,72],meter:4,sectionBars:12,chordBars:12,scale:[0,2,4,7,9],
  routes:[[0,0,3],[0,4,1],[0,2,4]],
  routeIndex:identity=>Math.min(2,Math.floor((identity.width*.65+identity.activity*.35)*3)),
  base:'space-time',lead:'vibraphone',detail:'strumstick',texture:'liquid-nebula',
  foundationKind:'synth',textureKind:'synth',padChorus:true,leadDelay:false,
  levels:{body:.18,lead:.25,detail:.21,bass:.085,texture:.12},
  room:22,attack:74,release:52,maxVoices:9,
  explanation:[
    'La semilla aporta un campo sostenido y poco percusivo, con F–G–A–C–D destacados y aperturas lentas. Se conserva su gramática pentatónica, no sus notas ni su audio.',
    'El pulso lento de 58–72 BPM es una decisión compositiva: el MP3 no permite fijar uno con certeza. Vibráfono y strumstick alternan la voz principal sobre un fondo discreto.',
    'La media y frecuencia de las ondas largas eligen centro y tempo; su anchura y actividad eligen recorrido armónico y la intensidad de cada apertura de doce compases.',
    'Cuatro familias de motivo nacen de la primera ventana disponible y permanecen estables: cambian ritmo, sentido y registro entre plantas. Las ondas cortas mueven detalles dentro de cada familia.',
    'Un cambio grande de señal puede mover el centro tonal al límite de escena. El fondo sostiene una raíz y cambia de color después, evitando dos golpes iguales en cada ciclo.',
  ],
  arrange(c){
    const phase=c.phase, inBreath=phase===11;
    const root=c.chord[0], rootIndex=c.scale.indexOf(root);
    const family=c.origin.mean<.17?0:c.origin.mean<.5?1:c.origin.activity<.55?2:3;
    // The broad harmonic horizon re-enters only once per four bars; the upper color enters later.
    if(phase%4===0)
      c.add(0,'foundation','space-time',pitch([root],49,44,56),13.7,32+c.data.activity*4,
        'Raíz sostenida: media y acorde de la ventana larga',{pan:-.14,attack:78,release:49});
    if(phase%4===2 && !inBreath){
      const color=c.chord[c.identity.width>.32?2:1];
      c.add(.5,'foundation','space-time',pitch([color],58,53,65),6.2,28+c.data.activity*3,
        'Color del acorde: anchura de las ondas largas elige tercera o quinta',{pan:.16,attack:80,release:45});
    }
    if(phase%4===0 || phase%4===3 && c.identity.persistence>.55)
      c.add(0,'bass','round-bass',pitch([root],39,34,46),1.3,31+c.data.activity*4,
        'Pulso grave separado del motivo',{pan:-.1,release:12});

    const rhythms=[
      [[.5,1.5,2.75],[1,2.25],[.75,1.75,3],[1.25,2.5]],
      [[.25,1.75,3],[.5,2.5],[.25,1.25,2.75],[1.5,3]],
      [[1,3],[.5,2],[1.5,3],[.75,2.5]],
      [[.25,1,2,3],[.5,1.5,2.5],[.25,1.25,2.25,3],[.75,1.75,2.75]],
    ][family][phase%4];
    const paths=[[0,1,2,4],[4,2,1,0],[2,4,3,1],[0,2,4,3]][family];
    if(!inBreath) rhythms.forEach((at,i)=>{
      const cell=c.field.cells[(phase*3+i*5)%16];
      const bend=cell.value>.24?1:cell.value<-.24?-1:0;
      const degree=(paths[(phase+i)%4]+bend+5)%5;
      const tone=c.scale[(rootIndex+degree)%5];
      const answer=i===rhythms.length-1 && (phase%2===0 || family===3);
      const plucked=answer || family===3 && i===0;
      const voice=plucked?'strumstick':'vibraphone';
      c.add(at+(cell.motion>.4?.25:0),plucked?'detail':'contour',voice,
        pitch([tone],family===2?72:family===3?78:70,61,81),plucked?.85:.65+i*.1,
        44+c.data.activity*6+cell.accent*4-i,
        'Familia de motivo de la identidad larga; cada onda corta ponderada modifica un grado y un ataque',
        {pan:cell.value*.35,attack:plucked?5:7,release:plucked?26:29});
    });
    if((phase===4 || phase===8) && (c.identity.width>.2 || c.identity.activity>.48)){
      const cell=c.field.cells[10];
      c.add(1,'texture','liquid-nebula',pitch([c.chord[1]],62,57,69),2.7,29+c.data.activity*3,
        'Apertura de escena: ondas largas habilitan nube de registro medio',
        {pan:cell.value*.28,attack:79,release:45});
    }
    if(inBreath && c.identity.persistence>.65)
      c.add(1,'detail','strumstick',pitch([root],72,66,78),1.1,40,
        'Último reflejo antes del silencio del primer plano',{attack:5,release:26});
  },
});
