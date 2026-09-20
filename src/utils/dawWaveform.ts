/** Cache every sample's extrema, including all channels, once per decoded source. */
const cache = new WeakMap<
  AudioBuffer,
  { min: Float32Array; max: Float32Array }
>();
const BLOCK = 128;
export function waveformEnvelope(
  buffer: AudioBuffer,
  start: number,
  end: number,
  columns: number,
) {
  let peaks = cache.get(buffer);
  if (!peaks) {
    const count = Math.ceil(buffer.length / BLOCK);
    peaks = { min: new Float32Array(count), max: new Float32Array(count) };
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const samples = buffer.getChannelData(channel);
      for (let i = 0; i < samples.length; i++) {
        const block = Math.floor(i / BLOCK);
        peaks.min[block] = Math.min(peaks.min[block], samples[i]);
        peaks.max[block] = Math.max(peaks.max[block], samples[i]);
      }
    }
    cache.set(buffer, peaks);
  }
  const count = Math.max(1, Math.ceil(columns));
  const first = Math.max(0, start * buffer.sampleRate);
  const length = Math.max(
    0,
    Math.min(buffer.length, end * buffer.sampleRate) - first,
  );
  return Array.from({ length: count }, (_, i) => {
    const from = Math.floor((first + (length * i) / count) / BLOCK);
    const to = Math.min(
      peaks!.min.length,
      Math.ceil((first + (length * (i + 1)) / count) / BLOCK),
    );
    let min = 0,
      max = 0;
    for (let j = from; j < to; j++) {
      min = Math.min(min, peaks!.min[j]);
      max = Math.max(max, peaks!.max[j]);
    }
    return { min, max };
  });
}
