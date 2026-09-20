import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
export function DawCreateTrackDialog({
  onChoose,
  onClose,
  disabled,
}: {
  onChoose: (kind: "empty" | "upload" | "midi") => void;
  onClose: () => void;
  disabled: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const choices = [
    {
      kind: "empty" as const,
      title: "Create New Empty Track",
      detail: "Record audio into a blank track",
      path: "M4 6h24v20H4z M16 11v10 M11 16h10",
    },
    {
      kind: "upload" as const,
      title: "Create from uploaded Audio Track",
      detail: "One new track for each audio file",
      path: "M5 22v6h22v-6 M16 23V4 M9 11l7-7 7 7",
    },
    {
      kind: "midi" as const,
      title: "Create MIDI software instrument track",
      detail: "Play and record notes with a soft synth",
      path: "M3 5h26v22H3z M9 5v22 M16 5v22 M23 5v22 M7 5v12h4V5 M14 5v12h4V5 M21 5v12h4V5",
    },
  ];
  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby="create-track-title"
      className="m-auto w-[min(44rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-6 text-zinc-100 shadow-2xl backdrop:bg-black/70"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-6 flex items-center justify-between">
        <h2 id="create-track-title" className="text-lg font-semibold">
          Create a track
        </h2>
        <button
          aria-label="Close create track dialog"
          className="rounded px-2 py-1 hover:bg-zinc-700"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {choices.map((choice) => (
          <button
            key={choice.kind}
            disabled={disabled}
            onClick={() => onChoose(choice.kind)}
            className="flex flex-col items-center rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-6 text-center transition hover:border-brand-400 hover:bg-brand-950 focus-visible:outline-2 focus-visible:outline-brand-300 disabled:opacity-40"
          >
            <svg
              viewBox="0 0 32 32"
              className="mb-5 h-16 w-16 text-brand-300"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={choice.path} />
            </svg>
            <span className="text-sm font-semibold">{choice.title}</span>
            <span className="mt-2 text-xs text-zinc-400">{choice.detail}</span>
          </button>
        ))}
      </div>
    </dialog>,
    document.body,
  );
}
