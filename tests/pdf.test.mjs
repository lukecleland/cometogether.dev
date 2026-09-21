import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path, imports = {}) {
  const scope = { exports: {}, File, require: name => imports[name] };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope);
  return scope.exports;
}
const pdf = load('src/utils/pdf.ts');
test('PDF uploads accept missing MIME types and reject invalid or oversized files', async () => {
  const file = await pdf.preparePdf(new File(['%PDF-1.7\n'], 'score.PDF'));
  assert.equal(file.type, 'application/pdf');
  assert.equal(await file.text(), '%PDF-1.7\n');
  await assert.rejects(pdf.preparePdf(new File(['bad'], 'bad.pdf')), /does not appear/);
  await assert.rejects(pdf.preparePdf(new File(['%PDF-1.7'], 'text.txt')), /Choose a PDF/);
  await assert.rejects(pdf.preparePdf({ name: 'large.pdf', type: 'application/pdf', size: pdf.MAX_PDF_BYTES + 1 }), /50 MB/);
  for (const page of [0, -1, 1.5, NaN, Infinity, '2']) assert.equal(pdf.validPdfPage(page), false);
  assert.equal(pdf.validPdfPage(2), true);
});
test('PDF filename and shared page survive room bundles; invalid pages are rejected', () => {
  const bundle = load('src/utils/roomBundle.ts', { './roomPersistence': { ROOM_STATE_VERSION: 2 } });
  const state = { x: 0, y: 0, width: 560, height: 720, z: 1 };
  const snapshot = { version: 2, savedAt: 1, viewport: { width: 1440, height: 1000 }, fixedPanels: { local: state, remote: state }, panels: [{ id: 'pdf', type: 'pdf', state, pdfPage: 3, pdfFileName: 'score.pdf' }], drawings: [], positionTags: [], dockedIds: [], panelLabels: {}, customLabels: {}, canvas: { x: 0, y: 0, scale: 1 } };
  assert.deepEqual(JSON.parse(JSON.stringify(bundle.parseRoomBundle(bundle.serialiseRoomBundle(snapshot)))), snapshot);
  for (const page of [-1, 0, 1.5, '2']) {
    snapshot.panels[0].pdfPage = page;
    assert.throws(() => bundle.parseRoomBundle(bundle.serialiseRoomBundle(snapshot)), /damaged/);
  }
});
