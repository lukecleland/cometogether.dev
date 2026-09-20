import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path, imports = {}) {
  const scope = { exports: {}, require: name => imports[name] };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope);
  return scope.exports;
}
const board = load('src/utils/whiteboardPanel.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const item = (id, points = [[5, 5]]) => ({ id, kind: 'pen', points, width: 4, color: '#7c3aed' });
test('concurrent board drawings converge and stale stroke updates cannot shorten strokes', () => {
  const a = { item: item('a') }, b = { item: item('b') };
  assert.deepEqual(plain(board.changeBoard(board.changeBoard(undefined, a), b)), plain(board.changeBoard(board.changeBoard(undefined, b), a)));
  const longer = board.changeBoard(undefined, { item: item('a', [[5,5],[10,10]]) });
  assert.deepEqual(plain(board.changeBoard(longer, a)), plain(longer));
});
test('eraser and clear tombstones prevent late stroke resurrection while preserving concurrent additions', () => {
  const cleared = board.changeBoard(undefined, { remove: ['a'] });
  assert.equal(board.changeBoard(cleared, { item: item('a') }).items.length, 0);
  assert.equal(board.changeBoard(cleared, { item: item('b') }).items.length, 1);
});
test('room bundles preserve whiteboard content and reject malformed drawing data', () => {
  const { serialiseRoomBundle, parseRoomBundle } = load('src/utils/roomBundle.ts', { './whiteboardPanel': board, './daw': {}, './roomPersistence': { ROOM_STATE_VERSION: 2 } });
  const state = { x: 0, y: 0, width: 720, height: 540, z: 1 };
  const snapshot = { version: 2, savedAt: 1, viewport: { width: 1440, height: 1000 }, fixedPanels: { local: state, remote: state }, panels: [{ id: 'board', type: 'whiteboard', state, whiteboard: board.changeBoard(undefined, { item: item('a') }) }], drawings: [], positionTags: [], dockedIds: [], panelLabels: {}, customLabels: {}, canvas: { x: 0, y: 0, scale: 1 } };
  assert.deepEqual(plain(parseRoomBundle(serialiseRoomBundle(snapshot))), plain(snapshot));
  snapshot.panels[0].whiteboard.items[0].points = [[-100, 3]];
  assert.throws(() => parseRoomBundle(serialiseRoomBundle(snapshot)), /damaged/);
});
