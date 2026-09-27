import { defineMood, pitch } from './shared';

/** Piano-led waltz: an original cantabile arc, a clear left hand and breathing answers. */
export const ghibli = defineMood({
  id:'ghibli',name:'Studio Ghibli',description:'Vals de piano: melodía cantabile aguda, mano izquierda ligera y respuestas que respiran.',
  tempo:[79,86],meter:3,sectionBars:8,chordBars:2,scale:[0,2,4,5,7,9,11],
  routes:[[0,3,5,4],[0,5,3,4],[0,3,4,0]],
  routeIndex:identity=>Math.floor((identity.mean*.4+identity.activity*.3+identity.width*.3)*3),
  base:'piano-expresivo',lead:'piano-expresivo',detail:'piano-expresivo',texture:'renaissance-organ',
  foundationKind:'instrument',textureKind:'instrument',
  levels:{body:.17,lead:.40,detail:0,bass:.10,texture:0},room:24,attack:4,release:18,maxVoices:8,
  explanation:[
    'La referencia muestra un piano en torno a 83 BPM, con ataques a intervalos de unos 0,36 y 0,72 s y melodía destacada en registro medio-agudo. El tema nuevo usa esa escala de tiempo, no sus notas.',
    'Tema original de ocho compases en 3/4: ascenso, respuesta descendente, desarrollo y cadencia. La mano izquierda ofrece un bajo y un apoyo interior, sin competir con la melodía.',
    'La media y frecuencia ponderada eligen centro y pulso; anchura y actividad de la ventana larga eligen ruta armónica y si entra la orquestación.',
    'El arco de ocho compases da más peso al punto culminante y a las llegadas armónicas; las notas de paso y las anacrusas se tocan más suaves, pero con la tecla sostenida. La mano izquierda queda por debajo de la melodía.',
    'Las ondas cortas ponderadas por su aportación al ajuste matizan la fuerza y la articulación de cada nota; la actividad corta amplía el arco dinámico y la persistencia larga prolonga el legato. Las llegadas se enlazan entre compases y una sala cálida conserva su resonancia; una tecla repetida se suelta antes del siguiente ataque.',
    'El Steinway de este mood usa tres capas grabadas de intensidad y muestras de liberación. La velocidad elige la capa y el nivel; la duración controla la suelta de la tecla, sin simular pedal de resonancia.',
    'Las notas son originales; no se citan melodías de películas.',
  ],
  arrange(c){
    const phase=c.phase, scale=c.scale, chord=c.chord;
    const degree=scale.indexOf(chord[0]);
    const tone=(step:number)=>scale[(degree+step)%7];
    const expressive=c.identity.activity>.53;
    const invertedAnswer=c.origin.mean>.6 && c.origin.activity>.55;
    const leftCell=c.field.cells[(phase*2)%16];
    const phraseArc=[-2,0,3,5,7,3,0,-5][phase];
    const legato=1.04+c.identity.persistence*.18;

    if(phase!==7)
      c.add(0,'bass','piano-expresivo',pitch([chord[0]],44,39,52),1.2+c.identity.persistence*.45+leftCell.value*.1,
        37+c.data.activity*5+Math.max(-3,Math.min(3,leftCell.value*4)),
        'Mano izquierda: primer pulso del vals; persistencia larga regula el sostén y onda corta matiza el peso',
        {attack:3,release:10,pan:-.17});
    if(phase!==7 || c.identity.persistence>.58)
      c.add(phase%2===0?1.5:2,'foundation','piano-expresivo',pitch([chord[phase%2===0?1:2]],57,53,65),.72+c.identity.persistence*.34,
        29+c.data.activity*4+leftCell.motion*2,
        'Arpegio de mano izquierda: respuesta interior ligera; onda corta matiza el ataque',
        {attack:4,release:13,pan:-.12});

    // Relative scale degrees preserve a song-like arc over the selected chord route.
    const phrase:readonly (readonly [number,number])[][]=[
      [[.5,1],[1.5,2],[2,4]],
      [[.5,4],[1.5,3],[2,2]],
      [[0,2],[1,4],[2,5]],
      [[.5,4],[1.75,2]],
      [[.25,1],[1,2],[1.75,4],[2.5,5]],
      [[.5,5],[1.5,4],[2,2]],
      [[.25,4],[1,3],[2,2]],
      [[.5,2],[1.5,1],[2,0]],
    ];
    phrase[phase].forEach(([at,step],i)=>{
      const cell=c.field.cells[(phase*2+i*4)%16];
      const last=i===phrase[phase].length-1;
      const passing=i>0 && !last;
      const alteration=passing && Math.abs(cell.value)>.24?(cell.value>0?1:-1):0;
      const baseStep=invertedAnswer?phrase[phase][phrase[phase].length-1-i][1]:step;
      const rawStep=Math.max(0,Math.min(6,baseStep+alteration));
      // Strong phrase notes belong to the current triad; the plant may color
      // only the passing notes, so its motion cannot turn a cadence sour.
      const resolved=passing?rawStep:[0,2,4].reduce((best, candidate) =>
        Math.abs(candidate-rawStep)<Math.abs(best-rawStep)?candidate:best);
      const delay=expressive && passing && cell.motion>.35?.12:0;
      const start=at+delay+(invertedAnswer && phase%2===1?-.25:0);
      const nextPhase=(phase+1)%phrase.length;
      const next=last?3+phrase[nextPhase][0][0]-(invertedAnswer && nextPhase%2===1 ? .25 : 0):phrase[phase][i+1][0];
      const gap=Math.max(.3,next-start);
      const arrival=last || resolved===4;
      // Keep the score's hierarchy: the plant changes touch within each role.
      const touch=55+phraseArc+(passing?-8:arrival?5:-3)+c.data.activity*12
        +cell.value*7+cell.motion*2;
      const gate=passing?.9+c.identity.persistence*.1:arrival?legato+.1:legato;
      // A note-off in sfizz releases every active voice of the same key. Keep
      // the held note up to the next attack; its sampled release still overlaps.
      const length=Math.max(.22,Math.min(last?2.1:1.65,gap*(gate+cell.value*.07),last?gap-.06:Infinity));
      const midi=pitch([tone(resolved)],71+resolved*1.5,65,82);
      const scheduledStart=Math.round(start*4)/4;
      for(const previous of c.notes) if(previous.slot==='contour' && previous.midi===midi &&
        previous.step/4+previous.beats>scheduledStart-.06)
        previous.beats=Math.max(.22,scheduledStart-previous.step/4-.06);
      c.add(start,'contour','piano-expresivo',midi,length,
        Math.max(39,Math.min(82,touch)),
        'Melodía cantabile: arco y acentos de frase; onda corta modula pulsación y duración, persistencia larga sostiene el legato',
        {attack:4,release:21,pan:.09+cell.value*.07});
    });
  },
});
