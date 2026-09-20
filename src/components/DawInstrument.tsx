/** Pointer-captured keys allow chords and release reliably when dragged outside. */
export function DawInstrument({
  name,
  onNoteOn,
  onNoteOff,
}: {
  name: string;
  onNoteOn: (pitch: number) => void;
  onNoteOff: (pitch: number) => void;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-3 border-t border-zinc-800 bg-zinc-900 px-3 py-2"
      aria-label={`Instrument ${name}`}
    >
      <div className="w-28 shrink-0 text-xs">
        <span className="block truncate text-brand-300">{name}</span>
        <span className="text-[10px] text-zinc-500">Soft synth · C4–C5</span>
      </div>
      <div className="flex min-w-0 flex-1 gap-0.5">
        {Array.from({ length: 13 }, (_, i) => {
          const black = [1, 3, 6, 8, 10].includes(i);
          const note = [
            "C",
            "C♯",
            "D",
            "D♯",
            "E",
            "F",
            "F♯",
            "G",
            "G♯",
            "A",
            "A♯",
            "B",
            "C",
          ][i];
          return (
            <button
              key={i}
              aria-label={`Play ${note}${i === 12 ? 5 : 4}`}
              className={`h-12 min-w-0 flex-1 touch-none rounded-b border text-[9px] active:bg-brand-400 ${black ? "border-zinc-600 bg-zinc-950 text-zinc-300" : "border-zinc-400 bg-zinc-200 text-zinc-800"}`}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                onNoteOn(i + 60);
              }}
              onPointerUp={(e) => {
                e.currentTarget.releasePointerCapture(e.pointerId);
                onNoteOff(i + 60);
              }}
              onLostPointerCapture={() => onNoteOff(i + 60)}
              onPointerCancel={() => onNoteOff(i + 60)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!e.repeat) onNoteOn(i + 60);
                }
              }}
              onKeyUp={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onNoteOff(i + 60);
                }
              }}
              onBlur={() => onNoteOff(i + 60)}
            >
              {note}
            </button>
          );
        })}
      </div>
    </div>
  );
}
