import { useState } from "react";
import { DockButton } from "./Dock";
import { WikipediaReader } from "./WikipediaReader";
import { normaliseBrowserUrl, wikipediaArticle, type BrowserScroll } from "../utils/browserUrl";
import { Toast } from "./Toast";

export function BrowserWidget({
  initialUrl,
  browserScroll,
  onScrollChange,
  onClose,
  docked = false,
  onToggleDock,
  onUrlChange,
  title = "Browser",
}: {
  initialUrl?: string;
  onClose?: () => void;
  docked?: boolean;
  onToggleDock?: () => void;
  onUrlChange: (url: string) => void;
  browserScroll?: BrowserScroll;
  onScrollChange: (scroll: BrowserScroll) => void;
  title?: string;
}) {
  const url = initialUrl ?? '';
  const [draft, setDraft] = useState({ url, value: url });
  const inputValue = draft.url === url ? draft.value : url;
  const [inputError, setInputError] = useState(false);
  const loadUrl = (nextUrl: string) => {
    setDraft({ url: nextUrl, value: nextUrl });
    onUrlChange(nextUrl);
  };

  const navigate = () => {
    const nextUrl = normaliseBrowserUrl(inputValue);
    if (nextUrl) loadUrl(nextUrl);
    else {
      setInputError(true);

    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden">
      <div className="drag-handle flex items-center justify-between px-3 py-2 bg-zinc-800 cursor-grab active:cursor-grabbing select-none shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-4 h-4 text-sky-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 9h18M7 6.5h.01M10 6.5h.01" strokeLinecap="round" />
          </svg>
          <span className="text-xs font-semibold text-zinc-300 truncate">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onToggleDock && <DockButton docked={docked} onToggle={onToggleDock} />}
          {onClose && <button onClick={onClose} className="text-zinc-500 hover:text-red-400" aria-label="Close">×</button>}
        </div>
      </div>

      {(
        <>
          <div className="flex gap-2 px-2 py-2 bg-zinc-900 shrink-0">
            <input
              aria-label="Browser URL"
              type="url"
              value={inputValue}
              onChange={event => setDraft({ url, value: event.target.value })}
              onPaste={event => {
                const nextUrl = normaliseBrowserUrl(event.clipboardData.getData("text"));
                if (!nextUrl) return;
                event.preventDefault();
                loadUrl(nextUrl);
              }}
              onKeyDown={event => event.key === "Enter" && navigate()}
              placeholder="Paste a URL…"
              spellCheck={false}
              className={`min-w-0 flex-1 bg-zinc-800 text-zinc-100 text-xs rounded-lg px-3 py-1.5 outline-none border ${inputError ? "border-red-500" : "border-zinc-700 focus:border-sky-500"}`}
            />
            <button onClick={navigate} className="bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold px-3 rounded-lg">
              Go
            </button>
            {url && (
              <a href={url} target="_blank" rel="noreferrer" className="flex items-center text-zinc-400 hover:text-white px-1" title="Open in a new tab" aria-label="Open in a new tab">
                ↗
              </a>
            )}
          </div>
          <Toast message={inputError ? 'Enter a valid website URL.' : null} label="Browser URL error" onDismiss={() => setInputError(false)} />
          {wikipediaArticle(url) && <div className="px-2 pb-1 text-[10px] text-brand-300">Wikipedia · links and scrolling synced</div>}
          <div className="relative flex-1 min-h-0 bg-white">
            {wikipediaArticle(url) ? (
              <WikipediaReader key={url} url={url} scroll={browserScroll} onNavigate={loadUrl} onScroll={onScrollChange} />
            ) : url ? (
              <iframe key={url} src={url} title="Browser" className="absolute inset-0 w-full h-full border-0" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500 bg-zinc-100">
                Enter a URL to browse
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
