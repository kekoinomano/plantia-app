// Engineering thresholds, not a perceptual model of musical quality.
export const DEFAULT_LIMITS = {
  blockBars: 2, minimumBlocks: 3, internalMin: .008, internalMax: .32,
  crossMin: .12, crossRatio: 1.5,
};
export const MOOD_LIMITS = {
  sleep: { blockBars: 4, internalMin: .002, internalMax: .20 },
  psychedelic: { blockBars: 4 },
  ghibli: { blockBars: 8 },
  'deep-focus': { blockBars: 4, internalMin: .004, internalMax: .25 },
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

export function signature(bars, notes, engine) {
  const melodic = notes.filter(n => !['kick', 'snare', 'hat'].includes(engine.preset(n.patch.preset).model)
    && !engine.preset(n.patch.preset).percussion);
  const totalBeats = bars.reduce((sum, b) => sum + b.beats, 0);
  const rhythm = notes.map(n => {
    const bar = bars.find(b => n.time >= b.time && n.time < b.time + b.beats * 60 / b.bpm);
    return [bar ? Math.floor(clamp((n.time - bar.time) / (bar.beats * 60 / bar.bpm)) * 16) % 16 : 0, 1];
  });
  return {
    tempo: mean(bars.map(b => b.bpm)),
    register: mean(melodic.map(n => n.midi)),
    density: notes.length / totalBeats,
    gate: mean(notes.map(n => n.duration)) / (60 / mean(bars.map(b => b.bpm))),
    velocity: mean(notes.map(n => n.velocity)),
    pitch: distribution(melodic.map(n => [Math.round(n.midi) % 12, 1])),
    instruments: distribution(notes.map(n => [n.patch.preset, 1])),
    rhythm: distribution(rhythm),
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
  return { total: Object.entries(parts).reduce((sum, [key, value]) => sum + weights[key] * value, 0), parts };
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
    blocks.push({ start, end, notes: notes.length, signature: signature(group, notes, engine) });
  }
  const transitions = blocks.slice(1).map((block, i) => distance(blocks[i].signature, block.signature));
  const internal = mean(transitions.map(d => d.total));
  const maximum = Math.max(0, ...transitions.map(d => d.total));
  const enough = blocks.length >= limits.minimumBlocks;
  const checks = [
    { name: 'Variación temporal', status: !enough ? 'INSUFFICIENT' : internal >= limits.internalMin ? 'PASS' : 'FAIL',
      value: internal, required: `>= ${limits.internalMin}; ${limits.minimumBlocks} bloques completos` },
    { name: 'Continuidad entre bloques', status: !enough ? 'INSUFFICIENT' : maximum <= limits.internalMax ? 'PASS' : 'FAIL',
      value: maximum, required: `<= ${limits.internalMax}` },
  ];
  return { blocks, transitions, internal, maximum, checks };
}

export function compare(a, b, limits) {
  // Equal numbers of complete blocks: recording length must not create a difference.
  const count = Math.min(a.blocks.length, b.blocks.length);
  const comparisons = Array.from({ length: count }, (_, i) => distance(a.blocks[i].signature, b.blocks[i].signature));
  const within = analysis => mean(analysis.blocks.slice(1, count).map((block, i) =>
    distance(analysis.blocks[i].signature, block.signature).total));
  const baseline = Math.max(within(a), within(b));
  const required = Math.max(limits.crossMin, baseline * limits.crossRatio);
  const value = mean(comparisons.map(d => d.total));
  return { status: count < limits.minimumBlocks ? 'INSUFFICIENT' : value >= required ? 'PASS' : 'FAIL',
    blocks: count, value, required, internalBaseline: baseline, comparisons };
}
