import { useRef } from "react";

export function DawPanDial({
  value,
  name,
  onChange,
}: {
  value: number;
  name: string;
  onChange: (value: number) => void;
}) {
  const drag = useRef<{ y: number; value: number } | null>(null);
  const update = (next: number) =>
    onChange(Math.round(Math.max(-1, Math.min(1, next)) * 100) / 100);
  const label =
    value === 0
      ? "Center"
      : `${Math.round(Math.abs(value) * 100)}% ${value < 0 ? "left" : "right"}`;
  return (
    <div className="flex shrink-0 flex-col items-center gap-0.5">
      <div
        role="slider"
        tabIndex={0}
        aria-label={`Pan ${name}`}
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-valuenow={value}
        aria-valuetext={label}
        title={`Pan: ${label}. Drag vertically; double-click to center.`}
        className="relative h-8 w-8 touch-none cursor-ns-resize rounded-full border border-zinc-600 bg-gradient-to-b from-zinc-700 to-zinc-950 shadow outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, value };
        }}
        onPointerMove={(e) => {
          if (drag.current)
            update(
              drag.current.value +
                (drag.current.y - e.clientY) / (e.shiftKey ? 400 : 80),
            );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          update(0);
        }}
        onKeyDown={(e) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
            ].includes(e.key)
          ) {
            e.preventDefault();
            e.stopPropagation();
            update(
              e.key === "Home"
                ? -1
                : e.key === "End"
                  ? 1
                  : value +
                    (["ArrowRight", "ArrowUp"].includes(e.key) ? 1 : -1) *
                      (e.shiftKey ? 0.01 : 0.05),
            );
          }
        }}
      >
        <div
          className="absolute inset-1"
          style={{ transform: `rotate(${value * 135}deg)` }}
        >
          <span className="absolute left-1/2 top-0 h-2.5 w-0.5 -translate-x-1/2 rounded bg-emerald-300" />
        </div>
      </div>
      <span className="text-[9px] tabular-nums text-zinc-400">
        {value === 0
          ? "C"
          : `${value < 0 ? "L" : "R"} ${Math.round(Math.abs(value) * 100)}`}
      </span>
    </div>
  );
}
