export function normaliseBrowserUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
export function wikipediaArticle(input: string): { url: string; api: string; title: string } | null {
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol) || !/^(?:[a-z-]+\.)?(?:m\.)?wikipedia\.org$/i.test(url.hostname)) return null;
    const host = url.hostname.replace('.m.', '.');
    const origin = `https://${host === 'wikipedia.org' || host === 'www.wikipedia.org' ? 'en.wikipedia.org' : host}`;
    const title = url.pathname.startsWith('/wiki/') ? decodeURIComponent(url.pathname.slice(6)) : url.searchParams.get('title') || 'Main_Page';
    const api = new URL('/w/api.php', origin);
    api.search = new URLSearchParams({ action: 'parse', page: title, prop: 'text', redirects: '1', format: 'json', formatversion: '2', origin: '*' }).toString();
    return { url: `${origin}/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}${url.hash}`, api: api.href, title: title.replaceAll('_', ' ') };
  } catch { return null; }
}
export interface BrowserScroll { url: string; position: number }
export function validBrowserScroll(value: unknown): value is BrowserScroll {
  if (!value || typeof value !== 'object') return false;
  const scroll = value as BrowserScroll;
  return typeof scroll.url === 'string' && normaliseBrowserUrl(scroll.url) !== null && Number.isFinite(scroll.position) && scroll.position >= 0 && scroll.position <= 1;
}
