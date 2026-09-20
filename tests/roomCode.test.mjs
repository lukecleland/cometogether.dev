import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, globals = {}, imports = {}) {
  const scope = { exports: {}, require: name => imports[name], ...globals };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, scope);
  return scope.exports;
}
const { WORDS } = load('src/utils/wordList.ts');

test('room word pool is unique, expanded, and includes every length from five to nine', () => {
  assert.ok(WORDS.length > 1200);
  assert.equal(new Set(WORDS).size, WORDS.length);
  assert.ok(WORDS.every(word => /^[a-z]{5,9}$/.test(word)));
  assert.deepEqual([...new Set(WORDS.map(word => word.length))].sort(), [5, 6, 7, 8, 9]);
});

test('shared room URLs go straight to the session as a guest; empty URLs keep the home page', () => {
  for (const [search, expected] of [['?room=%20sunflower%20', 'SUNFLOWER'], ['?room=MAKER', 'MAKER'], ['', null], ['?room=%20', null]]) {
    const code = load('src/utils/roomCode.ts', { URLSearchParams, window: { location: { search } } }, { './wordList': { WORDS } });
    const jsx = (type, props) => ({ type, props });
    const { default: App } = load('src/App.tsx', {}, { react: { useState: init => [init(), () => {}] },
      'react/jsx-runtime': { jsx }, './pages/Home': { Home: 'Home' }, './pages/Session': { Session: 'Session' }, './utils/roomCode': code });
    const view = App();
    assert.equal(view.type, expected ? 'Session' : 'Home');
    if (expected) { assert.equal(view.props.roomCode, expected); assert.equal(view.props.isHost, false); }
  }
});
