import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const scope = { exports: {}, URL, URLSearchParams };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/utils/browserUrl.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope);
const { normaliseBrowserUrl, wikipediaArticle, validBrowserScroll } = scope.exports;
test('Wikipedia article routing preserves languages, mobile links and section targets', () => {
  const article = wikipediaArticle('https://fr.m.wikipedia.org/wiki/Musique#Histoire');
  assert.equal(article.url, 'https://fr.wikipedia.org/wiki/Musique#Histoire');
  const api = new URL(article.api);
  assert.equal(api.hostname, 'fr.wikipedia.org'); assert.equal(api.searchParams.get('page'), 'Musique'); assert.equal(api.searchParams.get('origin'), '*');
  assert.equal(wikipediaArticle('https://www.wikipedia.org').title, 'Main Page');
  assert.equal(wikipediaArticle('https://en.wikipedia.org/w/index.php?title=Music').title, 'Music');
  assert.equal(wikipediaArticle('https://wikipedia.org.evil.example/wiki/Music'), null);
  assert.equal(wikipediaArticle('https://en.wikipedia.org/wiki/%zz'), null);
});
test('shared browser URLs and scroll positions reject unsafe or invalid values', () => {
  assert.equal(normaliseBrowserUrl(' en.wikipedia.org/wiki/Music '), 'https://en.wikipedia.org/wiki/Music');
  for (const url of ['javascript:alert(1)', 'data:text/html,bad', 'file:///tmp/file', '']) assert.equal(normaliseBrowserUrl(url), null);
  for (const position of [-1, 2, NaN, Infinity]) assert.equal(validBrowserScroll({ url: 'https://en.wikipedia.org/wiki/Music', position }), false);
  assert.equal(validBrowserScroll({ url: 'https://en.wikipedia.org/wiki/Music', position: .5 }), true);
});
test('room bundles round-trip the shared article and scroll position', () => {
  const bundle = { exports: {}, require: name => ({ './browserUrl': scope.exports, './roomPersistence': { ROOM_STATE_VERSION: 2 }, './daw': {}, './whiteboardPanel': {} })[name] };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/utils/roomBundle.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, bundle);
  const state = { x: 0, y: 0, width: 560, height: 420, z: 1 }, url = 'https://en.wikipedia.org/wiki/Music';
  const snapshot = { version: 2, savedAt: 1, viewport: { width: 1440, height: 1000 }, fixedPanels: { local: state, remote: state }, panels: [{ id: 'browser', type: 'browser', state, initialUrl: url, browserScroll: { url, position: .4 } }], drawings: [], positionTags: [], dockedIds: [], panelLabels: {}, customLabels: {}, canvas: { x: 0, y: 0, scale: 1 } };
  assert.deepEqual(JSON.parse(JSON.stringify(bundle.exports.parseRoomBundle(bundle.exports.serialiseRoomBundle(snapshot)))), snapshot);
  snapshot.panels[0].browserScroll.position = 5;
  assert.throws(() => bundle.exports.parseRoomBundle(bundle.exports.serialiseRoomBundle(snapshot)), /damaged/);
});
