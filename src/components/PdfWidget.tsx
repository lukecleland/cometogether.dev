import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { DockButton } from './Dock';

export function PdfWidget({ file, title, page = 1, transferProgress, onPageChange, onRestore, onClose, docked, onToggleDock }: {
  file?: File; title: string; page?: number; transferProgress?: number;
  onPageChange: (page: number) => void; onRestore: (file: File) => void;
  onClose: () => void; docked: boolean; onToggleDock: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<{ file: File; document: PDFDocumentProxy } | null>(null);
  const [failure, setFailure] = useState<{ file: File; message: string } | null>(null);
  const document = loaded?.file === file ? loaded?.document : undefined;
  const error = failure?.file === file ? failure?.message : undefined;
  const currentPage = Math.max(1, Math.min(page, document?.numPages ?? page));
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let task: ReturnType<typeof import('pdfjs-dist').getDocument> | undefined;
    void (async () => {
      const pdf = await import('pdfjs-dist');
      const data = await file.arrayBuffer();
      if (cancelled) return;
      pdf.GlobalWorkerOptions.workerSrc = workerUrl;
      task = pdf.getDocument({ data, cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`, cMapPacked: true, standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`, wasmUrl: `${import.meta.env.BASE_URL}pdfjs/wasm/` });
      task.onPassword = () => {
        if (!cancelled) setFailure({ file, message: 'This PDF needs a password. Open an unlocked copy to share it.' });
        void task?.destroy();
      };
      const document = await task.promise;
      if (!cancelled) setLoaded({ file, document });
    })().catch(() => { if (!cancelled) setFailure({ file, message: 'This PDF could not be opened. Try an unlocked, valid PDF.' }); });
    return () => { cancelled = true; void task?.destroy(); };
  }, [file]);

  useEffect(() => {
    const host = container.current;
    if (!document || !host || !file) return;
    let cancelRender = () => {};
    const draw = () => {
      cancelRender();
      let cancelled = false;
      let rendering: RenderTask | undefined;
      cancelRender = () => { cancelled = true; rendering?.cancel(); };
      void (async () => {
        const pdfPage = await document.getPage(currentPage);
        if (cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const scale = Math.min(Math.max(1, host.clientWidth - 16) / base.width, Math.max(1, host.clientHeight - 16) / base.height);
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = pdfPage.getViewport({ scale: scale * ratio });
        const canvas = window.document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${viewport.width / ratio}px`; canvas.style.height = `${viewport.height / ratio}px`;
        canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${title}, page ${currentPage}`);
        rendering = pdfPage.render({ canvas, viewport });
        await rendering.promise;
        if (!cancelled) host.replaceChildren(canvas);
      })().catch(() => { if (!cancelled) setFailure({ file, message: 'This PDF page could not be rendered.' }); });
    };
    const observer = new ResizeObserver(draw); observer.observe(host); draw();
    return () => { observer.disconnect(); cancelRender(); host.replaceChildren(); };
  }, [document, currentPage, title, file]);

  return <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950">
    <div className="drag-handle flex shrink-0 cursor-grab items-center justify-between gap-2 bg-zinc-900 px-3 py-2 text-zinc-300">
      <span className="truncate text-xs font-semibold">{title}</span>
      <div className="flex items-center gap-1"><DockButton docked={docked} onToggle={onToggleDock} /><button onClick={onClose} aria-label="Close PDF">×</button></div>
    </div>
    <div className="no-drag flex shrink-0 items-center justify-center gap-3 p-2 text-xs text-zinc-200">
      <button disabled={!document || currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} className="rounded bg-zinc-800 px-2 py-1 disabled:opacity-40" aria-label="Previous PDF page">Previous</button>
      <span aria-live="polite">{document ? `${currentPage} / ${document.numPages}` : 'PDF'} · shared page</span>
      <button disabled={!document || currentPage >= document.numPages} onClick={() => onPageChange(currentPage + 1)} className="rounded bg-zinc-800 px-2 py-1 disabled:opacity-40" aria-label="Next PDF page">Next</button>
    </div>
    <div className="relative min-h-0 flex-1">
      <div ref={container} className="no-drag absolute inset-0 flex items-center justify-center overflow-hidden" />
      {(!document || error) && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950 p-4 text-center text-xs text-zinc-400">
        <span>{error ?? (file ? 'Loading PDF…' : transferProgress !== undefined ? `Receiving PDF… ${Math.round(transferProgress * 100)}%` : 'PDF file unavailable. Waiting for a participant to share it, or restore your local copy.')}</span>
        {!file && transferProgress === undefined && <label className="cursor-pointer rounded bg-zinc-800 px-3 py-2">Restore PDF<input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={event => { const selected = event.target.files?.[0]; if (selected) onRestore(selected); event.target.value = ''; }} /></label>}
      </div>}
    </div>
  </div>;
}
