import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

function load(path, imports = {}) {
  const js = ts.transpileModule(
    readFileSync(new URL(`../${path}`, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const context = { exports: {}, require: (name) => imports[name], Blob };
  vm.runInNewContext(js, context);
  return context.exports;
}
const daw = load("src/utils/daw.ts");
const track = (id, patch = {}) => ({
  id,
  name: id,
  sourceId: id,
  duration: 10,
  start: 0,
  trimStart: 0,
  trimEnd: 10,
  volume: 0.8,
  pan: 0,
  muted: false,
  solo: false,
  deleted: false,
  revision: 1,
  editId: id,
  ...patch,
});
const plain = (value) => JSON.parse(JSON.stringify(value));

test("concurrent additions and edits on different tracks converge without dropping tracks", () => {
  const a = track("a"),
    b = track("b");
  const left = daw.mergeDawTrack(daw.mergeDawTrack([], a), b);
  const right = daw.mergeDawTrack(daw.mergeDawTrack([], b), a);
  assert.deepEqual(plain(left), plain(right));
  const editA = track("a", { volume: 0.3, revision: 2 });
  const editB = track("b", { start: 5, revision: 2 });
  assert.deepEqual(
    plain(daw.mergeDawTrack(daw.mergeDawTrack(left, editA), editB)),
    plain(daw.mergeDawTrack(daw.mergeDawTrack(right, editB), editA)),
  );
});

test("same-track concurrent updates use a deterministic tie-breaker; stale edits are ignored", () => {
  const a = track("a", { editId: "first", volume: 0.3 });
  const b = track("a", { editId: "second", volume: 0.9 });
  assert.equal(daw.mergeDawTrack([a], b)[0].volume, 0.9);
  assert.equal(daw.mergeDawTrack([b], a)[0].volume, 0.9);
  assert.equal(
    daw.mergeDawTrack([b], track("a", { revision: 0 }))[0].volume,
    0.9,
  );
});

test("deletion wins over delayed edits and concurrent deletes converge", () => {
  const deleted = track("a", { deleted: true, revision: 2 });
  const stale = track("a", { revision: 3, volume: 0.2 });
  assert.equal(daw.mergeDawTrack([deleted], stale)[0].deleted, true);
  assert.equal(daw.mergeDawTrack([stale], deleted)[0].deleted, true);
  const anotherDelete = { ...deleted, editId: "z" };
  assert.deepEqual(
    plain(daw.mergeDawTrack([deleted], anotherDelete)),
    plain(daw.mergeDawTrack([anotherDelete], deleted)),
  );
});

test("rejects invalid trim, timeline, gain and non-finite input", () => {
  for (const patch of [
    { trimEnd: 11 },
    { trimStart: 10 },
    { start: -1 },
    { volume: 5 },
    { pan: 2 },
    { duration: NaN },
    { revision: Infinity },
    { start: 1800 },
  ]) {
    assert.equal(daw.isDawTrack(track("a", patch)), false);
    assert.equal(daw.mergeDawTrack([], track("a", patch)).length, 0);
  }
});

test("schedules source offsets, delayed starts and seeking past finished clips", () => {
  const clip = track("a", { start: 5, trimStart: 2, trimEnd: 8 });
  assert.deepEqual(plain(daw.clipSchedule(clip, 0)), {
    delay: 5,
    offset: 2,
    duration: 6,
  });
  assert.deepEqual(plain(daw.clipSchedule(clip, 7)), {
    delay: 0,
    offset: 4,
    duration: 4,
  });
  assert.equal(daw.clipSchedule(clip, 11), null);
  assert.equal(daw.dawEnd([clip]), 11);
});

test("mute, solo and deleted tracks determine the audible mix", () => {
  const tracks = [
    track("a"),
    track("b", { solo: true }),
    track("c", { solo: true, muted: true }),
    track("d", { deleted: true, solo: true }),
  ];
  assert.deepEqual(plain(daw.audibleTracks(tracks).map((t) => t.id)), ["b"]);
});

test("all scheduled sources share one audio clock and use track gain and pan", () => {
  const starts = [],
    gains = [],
    pans = [];
  const node = () => ({
    connect(next) {
      return next;
    },
    disconnect() {},
  });
  const ctx = {
    destination: node(),
    createBufferSource: () => ({
      ...node(),
      start: (...args) => starts.push(args),
    }),
    createGain: () => {
      const g = { ...node(), gain: { value: 0 } };
      gains.push(g);
      return g;
    },
    createStereoPanner: () => {
      const p = { ...node(), pan: { value: 0 } };
      pans.push(p);
      return p;
    },
  };
  daw.scheduleDaw(
    ctx,
    [
      track("a", { start: 2, pan: -0.5 }),
      track("b", { start: 4, volume: 0.4 }),
      track("c", { muted: true }),
    ],
    new Map([
      ["a", {}],
      ["b", {}],
      ["c", {}],
    ]),
    1,
    100,
  );
  assert.deepEqual(starts, [
    [101, 0, 10],
    [103, 0, 10],
  ]);
  assert.deepEqual(
    gains.map((g) => g.gain.value),
    [0.8, 0.4],
  );
  assert.deepEqual(
    pans.map((p) => p.pan.value),
    [-0.5, 0],
  );
});

test("WAV export interleaves stereo PCM, clamps peaks and writes correct headers", async () => {
  const samples = [new Float32Array([-2, 0.5]), new Float32Array([2, -0.5])];
  const blob = daw.encodeWav({
    numberOfChannels: 2,
    length: 2,
    sampleRate: 44100,
    getChannelData: (c) => samples[c],
  });
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.readUInt16LE(22), 2);
  assert.equal(bytes.readUInt32LE(24), 44100);
  assert.equal(bytes.readUInt32LE(40), 8);
  assert.deepEqual(
    [44, 46, 48, 50].map((offset) => bytes.readInt16LE(offset)),
    [-32768, 32767, 16384, -16384],
  );
});

test("portable bundles retain DAW edits and reject malformed track metadata", () => {
  const { serialiseRoomBundle, parseRoomBundle } = load(
    "src/utils/roomBundle.ts",
    { "./daw": daw, "./roomPersistence": { ROOM_STATE_VERSION: 2 } },
  );
  const state = { x: 0, y: 0, width: 900, height: 480, z: 1 };
  const snapshot = {
    version: 2,
    savedAt: 1,
    viewport: { width: 1440, height: 900 },
    panels: [
      {
        id: "daw",
        type: "daw",
        state,
        dawTracks: [track("a", { start: 3, trimStart: 1 })],
        recordings: [{ id: "a", name: "a.wav" }],
      },
    ],
    fixedPanels: { local: state, remote: state },
    drawings: [],
    positionTags: [],
    dockedIds: [],
    panelLabels: {},
    customLabels: {},
    canvas: { x: 0, y: 0, scale: 1 },
  };
  assert.deepEqual(
    plain(parseRoomBundle(serialiseRoomBundle(snapshot))),
    snapshot,
  );
  snapshot.panels[0].dawTracks[0].trimEnd = 99;
  assert.throws(
    () => parseRoomBundle(serialiseRoomBundle(snapshot)),
    /damaged/,
  );
});
