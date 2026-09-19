/** One non-destructive clip per track. Source audio is stored separately. */
export interface DawTrack {
  id: string;
  name: string;
  sourceId: string;
  duration: number;
  start: number;
  trimStart: number;
  trimEnd: number;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  deleted: boolean;
  revision: number;
  editId: string;
}

export const MAX_DAW_SECONDS = 1800;
export const MAX_DAW_FILE_BYTES = 50 * 1024 * 1024;

export function isDawTrack(value: unknown): value is DawTrack {
  if (!value || typeof value !== "object") return false;
  const t = value as DawTrack;
  return (
    ["id", "name", "sourceId", "editId"].every(
      (key) => typeof t[key as keyof DawTrack] === "string",
    ) &&
    !!t.id &&
    !!t.sourceId &&
    !!t.editId &&
    t.name.length <= 200 &&
    [
      "duration",
      "start",
      "trimStart",
      "trimEnd",
      "volume",
      "pan",
      "revision",
    ].every((key) => Number.isFinite(t[key as keyof DawTrack])) &&
    t.duration > 0 &&
    t.duration <= MAX_DAW_SECONDS &&
    t.start >= 0 &&
    t.start + t.trimEnd - t.trimStart <= MAX_DAW_SECONDS &&
    t.trimStart >= 0 &&
    t.trimEnd <= t.duration &&
    t.trimEnd > t.trimStart &&
    t.volume >= 0 &&
    t.volume <= 1 &&
    t.pan >= -1 &&
    t.pan <= 1 &&
    Number.isSafeInteger(t.revision) &&
    t.revision >= 0 &&
    typeof t.muted === "boolean" &&
    typeof t.solo === "boolean" &&
    typeof t.deleted === "boolean"
  );
}

/** Logical revisions + unique tie-breakers converge even when edits cross in flight.
 * Deletion is permanent for an id, so stale edits cannot resurrect a removed track. */
export function mergeDawTrack(
  tracks: DawTrack[] = [],
  incoming: DawTrack,
): DawTrack[] {
  if (!isDawTrack(incoming)) return tracks;
  const current = tracks.find((t) => t.id === incoming.id);
  if (
    (current?.deleted && !incoming.deleted) ||
    (current &&
      current.deleted === incoming.deleted &&
      (current.revision > incoming.revision ||
        (current.revision === incoming.revision &&
          current.editId >= incoming.editId)))
  )
    return tracks;
  return [...tracks.filter((t) => t.id !== incoming.id), incoming].sort(
    (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export const dawEnd = (tracks: DawTrack[]) =>
  Math.max(
    0,
    ...tracks
      .filter((t) => !t.deleted)
      .map((t) => t.start + t.trimEnd - t.trimStart),
  );
export const audibleTracks = (tracks: DawTrack[]) => {
  const active = tracks.filter((t) => !t.deleted);
  const solo = active.some((t) => t.solo);
  return active.filter((t) => !t.muted && (!solo || t.solo));
};

export function clipSchedule(track: DawTrack, playhead: number) {
  const skipped = Math.max(0, playhead - track.start);
  const duration = track.trimEnd - track.trimStart - skipped;
  return duration > 0
    ? {
        delay: Math.max(0, track.start - playhead),
        offset: track.trimStart + skipped,
        duration,
      }
    : null;
}

/** Schedule all tracks against one audio clock, including clips starting later. */
export function scheduleDaw(
  context: BaseAudioContext,
  tracks: DawTrack[],
  buffers: Map<string, AudioBuffer>,
  playhead: number,
  when: number,
) {
  const sources: AudioBufferSourceNode[] = [];
  for (const track of audibleTracks(tracks)) {
    const buffer = buffers.get(track.sourceId);
    const clip = clipSchedule(track, playhead);
    if (!buffer || !clip) continue;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const pan = context.createStereoPanner();
    source.buffer = buffer;
    gain.gain.value = track.volume;
    pan.pan.value = track.pan;
    source.connect(gain).connect(pan).connect(context.destination);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      pan.disconnect();
    };
    source.start(when + clip.delay, clip.offset, clip.duration);
    sources.push(source);
  }
  return sources;
}

export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const bytes = buffer.length * channels * 2;
  const data = new ArrayBuffer(44 + bytes);
  const view = new DataView(data);
  const word = (offset: number, text: string) =>
    [...text].forEach((letter, i) =>
      view.setUint8(offset + i, letter.charCodeAt(0)),
    );
  word(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  word(8, "WAVE");
  word(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  word(36, "data");
  view.setUint32(40, bytes, true);
  const samples = Array.from({ length: channels }, (_, c) =>
    buffer.getChannelData(c),
  );
  for (let i = 0; i < buffer.length; i++)
    for (let c = 0; c < channels; c++) {
      const sample = Math.max(-1, Math.min(1, samples[c][i]));
      view.setInt16(
        44 + (i * channels + c) * 2,
        Math.round(sample * (sample < 0 ? 32768 : 32767)),
        true,
      );
    }
  return new Blob([data], { type: "audio/wav" });
}
