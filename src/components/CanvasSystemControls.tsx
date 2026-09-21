export function CanvasSystemControls({ overview, onFit, onShowAll }: { overview: boolean; onFit: () => void; onShowAll: () => void }) {
  return <nav data-canvas-chrome aria-label="Canvas system controls" className="canvas-system-controls">
    <button onClick={onFit} title="Fit all canvas content on screen" aria-label="Fit Screen">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /><rect x="8" y="8" width="8" height="8" rx="1" /></svg><span>Fit Screen</span>
    </button>
    <button onClick={onShowAll} title="Show all panels in an overview" aria-label="Show all" aria-pressed={overview}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="3" width="10" height="8" rx="1.5" /><rect x="16" y="3" width="5" height="11" rx="1.5" /><rect x="3" y="14" width="10" height="7" rx="1.5" /><path d="M16 17h5v4h-5z" /></svg><span>Show all</span>
    </button>
  </nav>;
}
