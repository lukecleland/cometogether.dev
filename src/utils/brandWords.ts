// Keep the lyric together even when it crosses a scheduled return to “work”.
const phrases = ['watch', 'create', 'record', 'jam', 'learn', 'sing', 'laugh', 'party', 'sketch', 'build', 'develop', 'write', 'compose', 'code', 'grow', ['stop', 'collaborate', 'listen']] as const;
export function buildBrandWords(): string[] {
  const words = ['make', 'work'];
  let sinceWork = 0;
  for (const phrase of phrases) {
    const group = typeof phrase === 'string' ? [phrase] : phrase;
    words.push(...group);
    sinceWork += group.length;
    if (sinceWork >= 4) { words.push('work'); sinceWork = 0; }
  }
  return words;
}
export const BRAND_WORDS = buildBrandWords();
