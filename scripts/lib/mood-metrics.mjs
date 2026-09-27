// Engineering thresholds, not a perceptual model of musical quality.
export const DEFAULT_LIMITS = {
  blockBars: 2, cycleBlocks: 1, minimumBlocks: 3, internalMin: .008, internalMax: .32,
  crossMin: .12, crossRatio: 1.5,
};
export const MOOD_LIMITS = {
  sleep: { blockBars: 4, internalMin: .002, internalMax: .20, crossRatio: 1.25 },
  psychedelic: { blockBars: 4 },
  ghibli: { blockBars: 8 },
  'deep-focus': { blockBars: 4, internalMin: .004, internalMax: .25 },
  space: { blockBars: 4 },
  'smooth-techno': { blockBars: 4, cycleBlocks: 2 },
  'jazz-session': { blockBars: 4 },
};
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const clamp = x => Math.max(0, Math.min(1, x));
const distribution = entries => {
  const result = {};
  for (const [key, weight] of entries) result[key] = (result[key] ?? 0) + weight;
  const total = Object.values(result).reduce((a, b) => a + b, 0);
  for (const key of Object.keys(result)) result[key] /= total || 1;
  return result;
};
const histogramDistance = (a, b) => .5 * [...new Set([...Object.keys(a), ...Object.keys(b)])]
  .reduce((sum, key) => sum + Math.abs((a[key] ?? 0) - (b[key] ?? 0)), 0);

export function signature(bars, notes, engine, profile) {
  const melodic = notes.filter(n => !['kick', 'snare', 'hat'].includes(engine.preset(n.patch.preset).model)
    && !engine.preset(n.patch.preset).percussion);
  const lead = notes.filter(n => n.slot === 'contour' || n.slot === 'detail').sort((a, b) => a.time - b.time);
  const beatSeconds = 60 / mean(bars.map(b => b.bpm));
  const motif = lead.slice(1).map((note, i) => [
    `${Math.max(-12, Math.min(12, Math.round(note.midi - lead[i].midi)))}:${Math.min(8, Math.round((note.time - lead[i].time) / beatSeconds * 2))}`,
    1,
  ]);
  const totalBeats = bars.reduce((sum, b) => sum + b.beats, 0);
  const rhythm = notes.map(n => {
    const bar = bars.find(b => n.time >= b.time && n.time < b.time + b.beats * 60 / b.bpm);
    return [bar ? Math.floor(clamp((n.time - bar.time) / (bar.beats * 60 / bar.bpm)) * 16) % 16 : 0, 1];
  });
  return {
    profile,
    tempo: mean(bars.map(b => b.bpm)),
    register: mean(melodic.map(n => n.midi)),
    density: notes.length / totalBeats,
    gate: mean(notes.map(n => n.duration)) / (60 / mean(bars.map(b => b.bpm))),
    velocity: mean(notes.map(n => n.velocity)),
    pitch: distribution(melodic.map(n => [Math.round(n.midi) % 12, 1])),
    instruments: distribution(notes.map(n => [n.patch.preset, 1])),
    rhythm: distribution(rhythm),
    motif: distribution(motif),
  };
}

export function distance(a, b) {
  const parts = {
    tempo: clamp(Math.abs(a.tempo - b.tempo) / 30),
    register: clamp(Math.abs(a.register - b.register) / 24),
    density: clamp(Math.abs(a.density - b.density) / 3),
    gate: clamp(Math.abs(a.gate - b.gate) / 4),
    velocity: clamp(Math.abs(a.velocity - b.velocity) / 64),
    pitch: histogramDistance(a.pitch, b.pitch),
    instruments: histogramDistance(a.instruments, b.instruments),
    rhythm: histogramDistance(a.rhythm, b.rhythm),
  };
  const weights = { tempo: .15, register: .08, density: .10, gate: .07,
    velocity: .05, pitch: .25, instruments: .20, rhythm: .10 };
  const base = Object.entries(parts).reduce((sum, [key, value]) => sum + weights[key] * value, 0);
  if (a.profile === b.profile && (a.profile === 'ghibli' || a.profile === 'space')) {
    parts.motif = histogramDistance(a.motif, b.motif);
    const motifWeight = a.profile === 'ghibli' ? .2 : .1;
    return { total: base * (1 - motifWeight) + parts.motif * motifWeight, parts };
  }
  return { total: base, parts };
}

function ghibliTexture(bars, notes) {
  let occupied = 0, seconds = 0, attacks = 0, peak = 0;
  for (const bar of bars) {
    const start = bar.time, end = start + bar.beats * 60 / bar.bpm;
    const current = notes.filter(n => n.time >= start && n.time < end);
    attacks += current.length;
    const lead = notes.filter(n => (n.slot === 'contour' || n.slot === 'detail')
      && n.time < end && n.time + n.duration > start);
    const spans = lead.map(n => [Math.max(start, n.time), Math.min(end, n.time + n.duration)])
      .sort((a, b) => a[0] - b[0]);
    let until = start;
    for (const [from, to] of spans) { occupied += Math.max(0, to - Math.max(from, until)); until = Math.max(until, to); }
    seconds += end - start;
    const edges = notes.filter(n => n.time < end && n.time + n.duration > start)
      .flatMap(n => [{ time: Math.max(start, n.time), delta: 1 },
        { time: Math.min(end, n.time + n.duration), delta: -1 }])
      .sort((a, b) => a.time - b.time || a.delta - b.delta);
    let active = 0;
    for (const edge of edges) { active += edge.delta; peak = Math.max(peak, active); }
  }
  return { attacksPerBar: attacks / bars.length, foregroundRest: (seconds - occupied) / seconds, peakVoices: peak };
}

export function analyse(score, engine, limits) {
  // Exclude startup and unfinished bars. Work from emitted notes, not scheduled intentions.
  const bars = score.bars.filter(b => !b.summary?.intro && !b.summary?.warmingUp
    && b.time + b.beats * 60 / b.bpm <= score.duration);
  const blocks = [];
  for (let i = 0; i + limits.blockBars <= bars.length; i += limits.blockBars) {
    const group = bars.slice(i, i + limits.blockBars);
    const start = group[0].time, end = group.at(-1).time + group.at(-1).beats * 60 / group.at(-1).bpm;
    const notes = score.notes.filter(n => n.time >= start && n.time < end);
    blocks.push({ start, end, notes: notes.length,
      plantChange: Math.max(0, ...group.map(b => b.summary?.signalChange ?? 0)),
      signature: signature(group, notes, engine, score.config.profile) });
  }
  // Compare equivalent places in a repeated form. Otherwise the planned
  // A/B harmony of an eight-bar loop is mistaken for plant-driven drift.
  const stride=limits.cycleBlocks;
  const transitions = blocks.slice(stride).map((block, i) => distance(blocks[i].signature, block.signature));
  const continuityAllowances = blocks.slice(stride).map(block => limits.internalMax +
    Math.min(.15, Math.max(0, block.plantChange - .45) * .15));
  const internal = mean(transitions.map(d => d.total));
  const maximum = Math.max(0, ...transitions.map(d => d.total));
  const enough = blocks.length >= Math.max(limits.minimumBlocks,stride+1);
  const checks = [
    { name: 'Variación temporal', status: !enough ? 'INSUFFICIENT' : internal >= limits.internalMin ? 'PASS' : 'FAIL',
      value: internal, required: `>= ${limits.internalMin}; ${limits.minimumBlocks} bloques completos` },
    { name: 'Continuidad entre bloques', status: !enough ? 'INSUFFICIENT' :
      transitions.every((distance, i) => distance.total <= continuityAllowances[i]) ? 'PASS' : 'FAIL',
      value: maximum, required: `<= ${limits.internalMax} sin gran cambio vegetal; hasta +0.15 según señal` },
  ];
  const texture = score.config.profile === 'ghibli' && bars.length ? ghibliTexture(bars, score.notes) : null;
  if (texture) checks.push(
    { name: 'Aire entre frases', status: !enough ? 'INSUFFICIENT' : texture.foregroundRest >= .25 ? 'PASS' : 'FAIL',
      value: texture.foregroundRest, required: '>= 0.25 del tiempo sin melodía' },
    { name: 'Densidad del arreglo', status: !enough ? 'INSUFFICIENT' : texture.attacksPerBar <= 6 ? 'PASS' : 'FAIL',
      value: texture.attacksPerBar, required: '<= 6 ataques por compás; las voces simultáneas se miden aparte' },
    { name: 'Voces simultáneas', status: !enough ? 'INSUFFICIENT' : texture.peakVoices <= 4 ? 'PASS' : 'FAIL',
      value: texture.peakVoices, required: '<= 4 voces' },
  );
  return { blocks, transitions, continuityAllowances, internal, maximum, texture, checks };
}

export function compare(a, b, limits) {
  // Equal numbers of complete blocks: recording length must not create a difference.
  const count = Math.min(a.blocks.length, b.blocks.length);
  const comparisons = Array.from({ length: count }, (_, i) => distance(a.blocks[i].signature, b.blocks[i].signature));
  const stride=limits.cycleBlocks;
  const within = analysis => mean(analysis.blocks.slice(stride, count).map((block, i) =>
    distance(analysis.blocks[i].signature, block.signature).total));
  // One highly variable recording should not set the requirement for both plants.
  const baseline = (within(a) + within(b)) / 2;
  const required = Math.max(limits.crossMin, baseline * limits.crossRatio);
  const value = mean(comparisons.map(d => d.total));
  return { status: count < limits.minimumBlocks ? 'INSUFFICIENT' : value >= required ? 'PASS' : 'FAIL',
    blocks: count, value, required, internalBaseline: baseline, comparisons };
}
