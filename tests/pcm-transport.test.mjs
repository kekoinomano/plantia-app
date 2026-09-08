import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { AudioCore } from '../src/lib/sonora/dsp.ts';
import { Composer } from '../src/lib/sonora/composer.ts';
import { defaultConfiguration } from '../src/lib/sonora/presets.ts';

const bundle = await build({ entryPoints: ['src/lib/audio/native-synth.ts'],
  bundle: true, write: false, format: 'cjs', platform: 'node',
  plugins: [{ name: 'native-test-adapter', setup(b) {
    b.onResolve({ filter: /native-pcm$/ }, () => ({ path: 'pcm', namespace: 'stub' }));
    b.onResolve({ filter: /^react-native$/ }, () => ({ path: 'platform', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, ({path}) => ({
      contents: path === 'platform' ? 'export const Platform = { OS: "test" };'
        : 'import { AudioCore } from "./src/lib/sonora/dsp.ts"; export class NativePcmCore extends AudioCore { close() {} }',
      resolveDir: process.cwd(),
    }));
  } }],
});

function harness(cost = 0) {
  let now = 10000, id = 0;
  const timers = new Map(), sources = [], errors = [], gains = [];
  const setTimer = (fn, ms = 0) => {
    const key = ++id; timers.set(key, { fn, at: now + Math.max(0.1, ms) }); return key;
  };
  const module = { exports: {} };
  vm.runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports,
    __DEV__: false, Float32Array, setTimeout: setTimer, clearTimeout: key => timers.delete(key),
    performance: { now: () => (now += cost) }, console: { info() {}, warn() {} } });
  const gain = new Proxy({ value: 0 }, { get: (obj, prop) => prop === 'value'
    ? obj.value : (...args) => gains.push([prop, ...args]) });
  const context = {
    sampleRate: 48000, get currentTime() { return now / 1000; }, destination: {},
    createGain: () => ({ gain, connect() {}, disconnect() {} }),
    createBuffer: (_c, n) => {
      const data = [new Float32Array(n), new Float32Array(n)];
      return { duration: n / 48000, getChannelData: c => data[c] };
    },
    createBufferQueueSource: () => {
      const source = { buffers: [], stopped: false, onBufferEnded: null,
        connect() {}, disconnect() {}, clearBuffers() {},
        stop() { this.stopped = true; },
        enqueueBuffer(b) { this.buffers.push(b); },
        start(at, offset) { this.startAt = at; this.offset = offset;
          this.preload = this.buffers.reduce((s, b) => s + b.duration, 0); },
      };
      sources.push(source); return source;
    },
  };
  const config = defaultConfiguration();
  const synth = new module.exports.NativeSynth(context, config, {}, e => errors.push(e));
  async function step() {
    if (!timers.size) return false;
    const [key, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
    timers.delete(key); now = Math.max(now, timer.at); timer.fn();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    return true;
  }
  async function until(check, limit = 10000) {
    for (let i = 0; i < limit && !check(); i++) {
      if (!await step()) break;
    }
    assert.ok(check(), 'Transport did not reach the expected state');
  }
  return { synth, context, config, errors, sources, gains, step, until,
    jump: seconds => { now += seconds * 1000; }, timers };
}
function audition(config, time = 10) {
  const c = new Composer(config); c.audition('synth', time); return c.drain();
}
function relative(events, origin) {
  return events.map(e => ({ ...e, time: e.time - origin,
    ...(e.type === 'note' ? { note: { ...e.note,
      time: e.note.time - origin, sourceTime: e.note.sourceTime - origin } } : {}),
  }));
}

test('PCM precarga antes de start y conserva exactamente Sonora y los intervalos', async () => {
  const h = harness();
  const events = audition(h.config);
  h.synth.events(events);
  await h.until(() => h.synth.diagnostics.blocks >= 50);
  assert.equal(h.errors.length, 0);
  assert.equal(h.sources.length, 1);
  assert.ok(h.sources[0].preload >= 0.12);
  assert.equal(h.sources[0].offset, 0);
  const core = new AudioCore(48000, h.config, {});
  core.schedule(relative(events, 10));
  let peak = 0;
  for (const buffer of h.sources[0].buffers) {
    const l = new Float32Array(buffer.getChannelData(0).length), r = new Float32Array(l.length);
    core.render(l, r);
    assert.deepEqual(buffer.getChannelData(0), l);
    assert.deepEqual(buffer.getChannelData(1), r);
    for (const x of l) peak = Math.max(peak, Math.abs(x));
  }
  assert.ok(peak > 0.01);
  assert.equal(h.synth.diagnostics.underruns, 0);
  h.synth.close();
});

test('PCM conserva colas de efectos después de la última voz y termina sin trabajar en silencio', async () => {
  const h = harness(); h.synth.events(audition(h.config));
  await h.until(() => h.synth.diagnostics.blocks > 10 && h.synth.diagnostics.voices === 0);
  const voicesEnded = h.synth.diagnostics.blocks;
  await h.until(() => !h.synth.diagnostics.active);
  assert.ok(h.synth.diagnostics.blocks > voicesEnded + 2);
  const last = h.sources[0].buffers.at(-1);
  assert.ok(last.getChannelData(0).every(x => Math.abs(x) < 0.00001));
  await h.step();
  assert.equal(h.timers.size, 0);
  h.synth.close();
});

test('PCM configurar no reinicia voces, reloj ni reverberación', async () => {
  const h = harness(); h.synth.events(audition(h.config));
  await h.until(() => h.synth.diagnostics.blocks >= 15);
  const before = h.synth.diagnostics;
  h.synth.configure(structuredClone(h.config), {});
  assert.equal(h.synth.diagnostics.voices, before.voices);
  await h.until(() => h.synth.diagnostics.blocks > before.blocks);
  assert.equal(h.sources.length, 1);
  assert.ok(h.synth.diagnostics.voices > 0);
  h.synth.close();
});

test('PCM reset durante un render descarta el bloque y permite arrancar otra sesión', async () => {
  const h = harness(4); h.synth.events(audition(h.config));
  await h.step(); // Suspended between native blocks.
  h.synth.reset();
  await h.step();
  assert.equal(h.sources.length, 1);
  assert.equal(h.synth.diagnostics.blocks, 1);
  h.synth.events(audition(h.config, h.context.currentTime));
  await h.until(() => h.sources.some(s => s.startAt != null));
  assert.equal(h.errors.length, 0);
  h.synth.close();
  for (let i = 0; i < 5; i++) await h.step();
  assert.equal(h.timers.size, 0);
});

test('PCM un callback viejo no reactiva una cola cancelada', async () => {
  const h = harness(); h.synth.events(audition(h.config));
  await h.until(() => h.sources[0]?.startAt != null);
  const callback = h.sources[0].onBufferEnded;
  h.synth.reset(); callback({ isLastBufferInQueue: true });
  await h.step();
  assert.equal(h.synth.diagnostics.active, false);
  assert.equal(h.timers.size, 0);
  h.synth.close();
});

test('PCM se recupera de una cola vacía con nueva precarga, sin reutilizar audio atrasado', async () => {
  const h = harness(); h.synth.events(audition(h.config));
  await h.until(() => h.sources[0]?.startAt != null);
  h.jump(0.8);
  await h.until(() => h.sources.length === 2 && h.sources[1].startAt != null);
  assert.equal(h.synth.diagnostics.underruns, 1);
  assert.equal(h.sources[0].stopped, true);
  assert.ok(h.sources[1].preload >= 0.12);
  assert.equal(h.errors.length, 0);
  h.synth.close();
});

test('PCM propaga errores asíncronos y deja el transporte detenido', async () => {
  const h = harness();
  h.context.createBuffer = () => { throw new Error('allocation failed'); };
  h.synth.events(audition(h.config));
  await h.until(() => h.errors.length === 1);
  assert.match(h.errors[0].message, /allocation failed/);
  assert.equal(h.synth.diagnostics.active, false);
  assert.equal(h.timers.size, 0);
  h.synth.close();
});
