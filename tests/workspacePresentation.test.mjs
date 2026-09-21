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
test('landing shuffle starts make/work and returns to work without splitting the lyric', () => {
  const { BRAND_WORDS: words } = load('src/utils/brandWords.ts');
  assert.equal(words[0], 'make'); assert.equal(words[1], 'work');
  for (const word of ['sing','laugh','party','sketch','build','develop','write','compose','code','grow']) assert.ok(words.includes(word));
  const start = words.indexOf('stop'); assert.equal(words.slice(start, start + 3).join(','), 'stop,collaborate,listen');
  let since = 0;
  for (const word of words.slice(2)) {
    if (word === 'work') { assert.ok(since >= 4 && since <= 6); since = 0; }
    else since++;
  }
});
test('overview fits mixed panels in desktop/mobile slots without changing their geometry', () => {
  const { layoutOverview } = load('src/utils/panelOverview.ts');
  const items = [{ id: 'video', label: 'You', width: 300, height: 400 }, { id: 'daw', label: 'DAW', width: 900, height: 480 }, { id: 'audio', label: 'Track', width: 360, height: 220 }, { id: 'pdf', label: 'PDF', width: 560, height: 720 }];
  const before = JSON.stringify(items);
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    const frames = Object.values(layoutOverview(items, viewport));
    for (const frame of frames) {
      assert.ok(frame.x >= 0 && frame.y >= 0 && frame.width > 0 && frame.height > 0);
      assert.ok(frame.x + frame.width <= viewport.width);
      assert.ok(frame.y + frame.height + 28 <= viewport.height - 80);
    }
    for (let a = 0; a < frames.length; a++) for (let b = a + 1; b < frames.length; b++) {
      const x = frames[a], y = frames[b];
      assert.ok(x.x + x.width <= y.x || y.x + y.width <= x.x || x.y + x.height <= y.y || y.y + y.height <= x.y);
    }
  }
  assert.equal(JSON.stringify(items), before);
});
test('audio themes survive portable room exports and reject unknown themes', () => {
  const { serialiseRoomBundle, parseRoomBundle } = load('src/utils/roomBundle.ts', { './roomPersistence': { ROOM_STATE_VERSION: 2 } });
  const state = { x: 0, y: 0, width: 400, height: 400, z: 1 };
  const snapshot = { version: 2, savedAt: 1, viewport: { width: 1440, height: 1000 }, fixedPanels: { local: state, remote: state }, panels: [{ id: 'audio', type: 'audio', state, audioTheme: 'tape' }], drawings: [], positionTags: [], dockedIds: [], panelLabels: {}, customLabels: {}, canvas: { x: 0, y: 0, scale: 1 } };
  assert.equal(parseRoomBundle(serialiseRoomBundle(snapshot)).panels[0].audioTheme, 'tape');
  snapshot.panels[0].audioTheme = 'bad'; assert.throws(() => parseRoomBundle(serialiseRoomBundle(snapshot)), /damaged/);
  delete snapshot.panels[0].audioTheme; assert.equal(parseRoomBundle(serialiseRoomBundle(snapshot)).panels[0].audioTheme, undefined);
});
