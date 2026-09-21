export interface OverviewItem { id: string; label: string; width: number; height: number }
export interface OverviewFrame { x: number; y: number; width: number; height: number; scale: number; label: string }
/** Temporary screen-space slots; never write them to shared panel geometry. */
export function layoutOverview(items: OverviewItem[], viewport: { width: number; height: number }): Record<string, OverviewFrame> {
  if (!items.length) return {};
  const gap = 24, margin = 20, top = 88;
  const width = Math.max(1, viewport.width - margin * 2);
  const height = Math.max(1, viewport.height - top - 96);
  const columns = Math.min(items.length, Math.max(1, Math.ceil(Math.sqrt(items.length * width / height))));
  const rows = Math.ceil(items.length / columns);
  const cellWidth = Math.max(1, (width - gap * (columns - 1)) / columns);
  const cellHeight = Math.max(1, (height - gap * (rows - 1)) / rows - 28);
  return Object.fromEntries(items.map((item, index) => {
    const scale = Math.min(cellWidth / item.width, cellHeight / item.height, 1);
    const w = item.width * scale, h = item.height * scale;
    return [item.id, { x: margin + (index % columns) * (cellWidth + gap) + (cellWidth - w) / 2, y: top + Math.floor(index / columns) * (cellHeight + gap + 28) + (cellHeight - h) / 2, width: w, height: h, scale, label: item.label }];
  }));
}
