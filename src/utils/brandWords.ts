// Keep the lyric together even when it crosses a scheduled return to “make”.
const phrases = ['work', 'watch', 'create', 'record', 'jam', 'learn', 'sing', 'laugh', 'party', 'sketch', 'build', 'develop', 'write', 'compose', 'code', 'grow', ['stop', 'collaborate', 'listen']] as const;
export function buildBrandWords(): string[] {
  const words = ['make'];
  let sinceMake = 0;
  for (const [index, phrase] of phrases.entries()) {
    const group = typeof phrase === 'string' ? [phrase] : phrase;
    words.push(...group);
    sinceMake += group.length;
    // The loop already returns to “make”, so never append a duplicate at the end.
    if (sinceMake >= 4 && index < phrases.length - 1) { words.push('make'); sinceMake = 0; }
  }
  return words;
}
export const BRAND_WORDS = buildBrandWords();
export const brandWordDuration = (word: string): number => word === 'make' ? 5200 : 2600;
