import { useEffect, useEffectEvent, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { normaliseBrowserUrl, wikipediaArticle, type BrowserScroll } from '../utils/browserUrl';
import { useMovementSync } from '../hooks/useMovementSync';
import { Toast } from './Toast';

const cache = new Map<string, { html: string; title: string }>();
const escape = (s: string) => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function articleDocument(html: string, title: string, url: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  for (const element of parsed.querySelectorAll('[href], [src]')) {
    for (const attribute of ['href', 'src']) {
      const value = element.getAttribute(attribute);
      if (value) { try { element.setAttribute(attribute, new URL(value, url).href); } catch { element.removeAttribute(attribute); } }
    }
  }
  const clean = DOMPurify.sanitize(parsed.body.innerHTML, { USE_PROFILES: { html: true }, FORBID_TAGS: ['form','input','button','style','link','iframe','object','embed','video','audio'], FORBID_ATTR: ['style','srcset','target'] });
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>body{margin:0;padding:20px;font:16px/1.6 system-ui,sans-serif;color:#202122;overflow-wrap:anywhere}h1,h2,h3{line-height:1.3}h1{font:30px Georgia,serif;border-bottom:1px solid #a2a9b1}h2{border-bottom:1px solid #ddd;margin-top:1.4em}a{color:#36c}img{max-width:100%;height:auto}table{max-width:100%;border-collapse:collapse;font-size:90%}td,th{padding:4px;border:1px solid #ddd}.infobox{float:right;width:40%;margin:0 0 12px 16px;background:#f8f9fa}.mw-editsection,.noprint,.navbox,.metadata{display:none}footer{clear:both;border-top:1px solid #ddd;margin-top:24px;font-size:12px}pre{white-space:pre-wrap}</style></head><body data-wikipedia-reader><h1>${escape(title)}</h1>${clean}<footer>From <a href="${escape(url)}">Wikipedia</a>. Text available under <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>; additional terms may apply.</footer></body></html>`;
}

export function WikipediaReader({ url, scroll, onNavigate, onScroll }: { url: string; scroll?: BrowserScroll; onNavigate: (url: string) => void; onScroll: (scroll: BrowserScroll) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const expectedScroll = useRef<number | null>(null);
  const [document, setDocument] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const sender = useMovementSync(onScroll);
  const navigate = useEffectEvent(onNavigate);
  const applyPosition = useEffectEvent(() => {
    const view = frame.current?.contentWindow;
    const body = view?.document.scrollingElement;
    if (!view || !body) return;
    if (scroll?.url === url) {
      const y = scroll.position * Math.max(0, body.scrollHeight - view.innerHeight);
      if (Math.abs(view.scrollY - y) > 1) { expectedScroll.current = y; view.scrollTo(0, y); }
    }
  });
  useEffect(() => {
    const controller = new AbortController();
    const article = wikipediaArticle(url);
    sender.cancel();
    if (!article) return;
    void (async () => {
      let result = cache.get(article.api);
      if (!result) {
        const response = await fetch(article.api, { signal: controller.signal, credentials: 'omit' });
        if (!response.ok) throw new Error('Wikipedia could not be loaded. Try again.');
        const data = await response.json();
        if (typeof data.parse?.text !== 'string') throw new Error('This Wikipedia article could not be found.');
        result = { html: data.parse.text, title: data.parse.title ?? article.title };
        if (cache.size >= 20) cache.delete(cache.keys().next().value!);
        cache.set(article.api, result);
      }
      if (!controller.signal.aborted) setDocument(articleDocument(result.html, result.title, article.url));
    })().catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Wikipedia could not be loaded.'); });
    return () => { controller.abort(); cleanup.current?.(); sender.cancel(); };
  }, [url, retry, sender]);
  useEffect(() => { applyPosition(); }, [scroll, document]);
  const currentScroll = useEffectEvent(() => scroll);
  useEffect(() => {
    const element = frame.current;
    if (!element || !document) return;
    let attached: Document | null = null;
    const loaded = () => {
      const view = frame.current?.contentWindow; const doc = view?.document;
      if (!view || !doc?.body?.hasAttribute('data-wikipedia-reader') || doc === attached) return;
      cleanup.current?.(); attached = doc; clearInterval(timer);
      setReady(true);
      const click = (event: MouseEvent) => {
        const target = event.target as Element;
        const link = target.closest?.('a[href]'); if (!link) return;
        event.preventDefault();
        const next = normaliseBrowserUrl(link.getAttribute('href') ?? '');
        if (next) { sender.cancel(); navigate(next); }
      };
      const changed = () => {
        const body = doc.scrollingElement; if (!body) return;
        if (expectedScroll.current !== null && Math.abs(view.scrollY - expectedScroll.current) < 2) { expectedScroll.current = null; return; }
        expectedScroll.current = null;
        sender.schedule({ url, position: Math.max(0, Math.min(1, view.scrollY / Math.max(1, body.scrollHeight - view.innerHeight))) });
      };
      doc.addEventListener('click', click); doc.addEventListener('scroll', changed, { passive: true });
      const observer = new ResizeObserver(() => applyPosition()); observer.observe(doc.body);
      cleanup.current = () => { observer.disconnect(); doc.removeEventListener('click', click); doc.removeEventListener('scroll', changed); };
      if (currentScroll()?.url === url) applyPosition();
      else if (new URL(url).hash) {
        let id = new URL(url).hash.slice(1);
        try { id = decodeURIComponent(id); } catch { /* Keep a literal fragment. */ }
        doc.getElementById(id)?.scrollIntoView();
      }
    };
    element.addEventListener('load', loaded);
    const timer = setInterval(loaded, 25);
    return () => { clearInterval(timer); element.removeEventListener('load', loaded); cleanup.current?.(); };
  }, [document, url, sender]);
  return <>
    <Toast message={error} label="Wikipedia error" action={{ label: 'Retry', onClick: () => { setError(null); setRetry(n => n + 1); } }} />
    {!ready && <div className="absolute inset-0 z-10 flex items-center justify-center bg-white p-4 text-sm text-zinc-500">{error ? <button onClick={() => { setError(null); setRetry(n => n + 1); }} className="rounded border px-3 py-2">Retry Wikipedia</button> : 'Loading Wikipedia…'}</div>}
    {document && <iframe ref={frame} title="Shared Wikipedia" sandbox="allow-same-origin" srcDoc={document} className="absolute inset-0 h-full w-full border-0" />}
  </>;
}
