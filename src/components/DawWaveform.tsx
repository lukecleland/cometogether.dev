import { memo, useMemo } from "react";
import { waveformEnvelope } from "../utils/dawWaveform";
import type { DawRegion } from "../utils/daw";

/** Draw only the visible part at one envelope column per CSS pixel. */
export const DawWaveform = memo(function DawWaveform({
  buffer,
  region,
  width,
  offset,
  viewport,
}: {
  buffer?: AudioBuffer;
  region: DawRegion;
  width: number;
  offset: number;
  viewport: number;
}) {
  const left = Math.max(0, Math.min(width, offset));
  const visible = Math.max(0, Math.min(width - left, viewport));
  const path = useMemo(() => {
    if (!buffer || visible <= 0) return "";
    const length = region.trimEnd - region.trimStart;
    const points = waveformEnvelope(
      buffer,
      region.trimStart + (left / width) * length,
      region.trimStart + ((left + visible) / width) * length,
      visible,
    );
    return points
      .map((p, i) => `M${i} ${25 - p.max * 24}V${25 - p.min * 24 + 0.35}`)
      .join(" ");
  }, [buffer, region.trimStart, region.trimEnd, width, left, visible]);
  if (!visible) return null;
  return (
    <svg
      data-waveform
      viewBox={`0 0 ${visible} 50`}
      preserveAspectRatio="none"
      className="absolute inset-y-0 h-full"
      style={{ left, width: visible }}
      aria-hidden="true"
    >
      <path d={path} stroke="currentColor" strokeWidth="1" />
    </svg>
  );
});
