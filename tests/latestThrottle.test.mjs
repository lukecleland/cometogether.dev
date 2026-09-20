import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function setup() {
  let clock = 0, id = 0;
  const timers = new Map();
  const scope = { exports: {}, setTimeout: (fn, delay) => { timers.set(++id, { fn, at: clock + delay }); return id; }, clearTimeout: id => timers.delete(id) };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/utils/latestThrottle.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope);
  const sent = [];
  return { sender: scope.exports.latestThrottle(value => sent.push(value)), sent, tick(ms) { clock += ms; for (const [id, timer] of timers) if (timer.at <= clock) { timers.delete(id); timer.fn(); } } };
}
test('continuous movement sends latest positions every 16ms without starvation', () => {
  const { sender, sent, tick } = setup();
  for (let i = 0; i < 20; i++) { sender.schedule(i); tick(4); }
  assert.deepEqual(sent, [3, 7, 11, 15, 19]);
});
test('final movement is retained when events stop between updates', () => {
  const { sender, sent, tick } = setup();
  sender.schedule(1); tick(8); sender.schedule(2); tick(8);
  assert.deepEqual(sent, [2]);
});
test('stop flushes immediately and cancellation prevents stale movement after leave', () => {
  const { sender, sent, tick } = setup();
  sender.schedule(1); sender.flush(2); tick(20);
  assert.deepEqual(sent, [2]);
  sender.schedule(3); sender.cancel(); tick(20);
  assert.deepEqual(sent, [2]);
  sender.schedule(4); tick(16);
  assert.deepEqual(sent, [2, 4]);
});
