import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import { transformFileSync } from "@babel/core";
import { LiveMusicEngine } from "../src/lib/plant-live-engine.ts";
import { defaultConfiguration } from "../src/lib/sonora/presets.ts";
import { decodePlantPacket } from "../src/lib/plant-packet.ts";

test("BLE conserva los diez valores y rechaza paquetes corruptos", () => {
  const values = [20000, 20001, 19998, 20004, 20007, 20006, 19990, 19993, 20002, 20005];
  const encode = (raw) => Buffer.from(raw).toString("base64");
  assert.deepEqual(decodePlantPacket(encode(JSON.stringify({ arr: values })), 4, 800), {
    seq: 4,
    elapsed_ms: 800,
    values,
  });
  for (const raw of ["{", '{"arr":[1,2]}', '{"arr":[1,2,3,4,5,6,7,8,9,"10"]}']) {
    assert.equal(decodePlantPacket(encode(raw), 5, 1000).values, null);
  }
});

test("el worklet serializado es autónomo y produce el mismo PCM que Sonora", () => {
  const code = transformFileSync("src/lib/audio/sonora-runtime.ts", {
    presets: [["babel-preset-expo", { worklets: true }]],
    caller: { name: "metro", platform: "ios", engine: "hermes", isDev: false },
  }).code;
  const sandbox = { exports: {}, require: createRequire(import.meta.url), __DEV__: false };
  sandbox.global = sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox);
  const serialized = sandbox.exports.createSonoraEngine;
  assert.deepEqual(Object.keys(serialized.__closure), []);
  // A fresh runtime has no module imports or main-thread class instances.
  const createEngine = vm.runInNewContext(`(${serialized.__initData.code})`);
  const config = defaultConfiguration();
  const original = new LiveMusicEngine(44100, 0, config);
  const native = createEngine(44100, 0, config, {});
  const left = new Float32Array(128),
    right = new Float32Array(128);
  const expectedLeft = new Float32Array(128),
    expectedRight = new Float32Array(128);
  let peak = 0,
    sequence = 0;
  for (let block = 0; block < 520; block++) {
    if (block % 69 === 0) {
      const packet = {
        seq: sequence++,
        elapsed_ms: (block * 128) / 44.1,
        values: Array.from(
          { length: 10 },
          (_, i) => 20000 + Math.round(Math.sin(sequence + i) * 120),
        ),
      };
      original.push(packet);
      native.push(packet);
    }
    original.render(expectedLeft, expectedRight);
    native.render(left, right);
    assert.deepEqual(left, expectedLeft);
    assert.deepEqual(right, expectedRight);
    for (const value of left) {
      assert.ok(Number.isFinite(value));
      peak = Math.max(peak, Math.abs(value));
    }
  }
  assert.ok(peak > 0.001, "El sensor debe generar audio audible");
});
