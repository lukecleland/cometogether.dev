import { useRef, useState } from 'react';
import { DockButton } from './Dock';
import { useMovementSync } from '../hooks/useMovementSync';
import { emptyBoard, type BoardChange, type BoardContent, type BoardItem } from '../utils/whiteboardPanel';

export function WhiteboardWidget({ content = emptyBoard(), onChange, onClose, onMinimize, docked, onToggleDock, title = 'Whiteboard' }: {
  content?: BoardContent; onChange: (change: BoardChange) => void; onClose: () => void; onMinimize: () => void;
  docked: boolean; onToggleDock: () => void; title?: string;
}) {
  const [tool, setTool] = useState<BoardItem['kind'] | 'eraser'>('pen');
  const [color, setColor] = useState('#7c3aed');
  const [width, setWidth] = useState(4);
  const [text, setText] = useState('');
  const drawing = useRef<BoardItem | null>(null);
  const ownItems = useRef<string[]>([]);
  const sender = useMovementSync(onChange);
  const point = (event: React.PointerEvent<SVGSVGElement>): [number, number] => {
    const matrix = event.currentTarget.getScreenCTM();
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix?.inverse());
    return [Math.max(0, Math.min(1000, p.x)), Math.max(0, Math.min(650, p.y))];
  };
  const erase = (event: React.PointerEvent<SVGSVGElement>) => {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-board-item]');
    if (target && event.currentTarget.contains(target)) onChange({ remove: [target.getAttribute('data-board-item')!] });
  };
  const finish = () => {
    if (!drawing.current) return;
    sender.flush({ item: drawing.current });
    drawing.current = null;
  };
  return <div data-whiteboard-widget className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950">
    <div className="drag-handle flex shrink-0 cursor-grab items-center justify-between bg-zinc-900 px-3 py-2 text-xs text-zinc-200">
      <span className="truncate font-semibold">{title}</span>
      <div className="flex items-center gap-2">
        <DockButton docked={docked} onToggle={onToggleDock} reserveMinimizeSlot={false} />
        <button className="no-drag" aria-label="Minimise whiteboard" onClick={onMinimize}>_</button>
        <button className="no-drag" aria-label="Close whiteboard" onClick={onClose}>×</button>
      </div>
    </div>
    <div className="no-drag flex shrink-0 flex-wrap items-center gap-1 border-b border-zinc-700 p-2 text-[11px] text-zinc-200">
      {(['pen', 'eraser', 'rectangle', 'ellipse', 'text'] as const).map(value => <button key={value} aria-pressed={tool === value} onClick={() => { finish(); setTool(value); }} className={`rounded px-2 py-1 capitalize ${tool === value ? 'bg-brand-600 text-white' : 'bg-zinc-800 hover:bg-zinc-700'}`}>{value}</button>)}
      <input type="color" aria-label="Whiteboard colour" value={color} onChange={e => setColor(e.target.value)} className="h-6 w-7 bg-transparent" />
      <select aria-label="Whiteboard stroke width" value={width} onChange={e => setWidth(Number(e.target.value))} className="rounded bg-zinc-800 p-1">{[2,4,8,16].map(n => <option key={n} value={n}>{n}px</option>)}</select>
      <button className="rounded bg-zinc-800 px-2 py-1" onClick={() => { finish(); let id = ownItems.current.pop(); while (id && !content.items.some(item => item.id === id)) id = ownItems.current.pop(); if (id) onChange({ remove: [id] }); }}>Undo</button>
      <button className="rounded bg-zinc-800 px-2 py-1" onClick={() => { finish(); onChange({ remove: [...content.items.map(item => item.id), ...ownItems.current] }); }}>Clear</button>
      {tool === 'text' && <input aria-label="Whiteboard text" placeholder="Type text, then click the board" value={text} maxLength={1000} onChange={e => setText(e.target.value)} className="min-w-0 flex-1 rounded bg-zinc-800 px-2 py-1" />}
    </div>
    <svg aria-label="Whiteboard drawing surface" viewBox="0 0 1000 650" className="no-drag min-h-0 w-full flex-1 touch-none bg-white" style={{ cursor: tool === 'text' ? 'text' : 'crosshair' }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
        if (tool === 'eraser') { erase(event); return; }
        if (tool === 'text' && !text.trim()) return;
        const item: BoardItem = { id: crypto.randomUUID(), kind: tool, points: [point(event)], color, width, ...(tool === 'text' ? { text } : {}) };
        ownItems.current.push(item.id);
        onChange({ item });
        if (tool !== 'text') drawing.current = item;
      }}
      onPointerMove={event => {
        if (!(event.buttons & 1)) return;
        if (tool === 'eraser') { erase(event); return; }
        const current = drawing.current; if (!current) return;
        const next = point(event);
        const points = current.kind === 'pen' ? [...current.points.slice(0, 1999), next] : [current.points[0], next];
        drawing.current = { ...current, points }; sender.schedule({ item: drawing.current });
      }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>
      {content.items.map(item => {
        const [start, end = start] = item.points;
        const common = { stroke: item.color, strokeWidth: item.width, fill: 'none', 'data-board-item': item.id };
        if (item.kind === 'text') return <text key={item.id} data-board-item={item.id} x={start[0]} y={start[1]} fill={item.color} fontSize={24 + item.width} fontFamily="sans-serif">{item.text}</text>;
        if (item.kind === 'rectangle') return <rect key={item.id} {...common} x={Math.min(start[0],end[0])} y={Math.min(start[1],end[1])} width={Math.abs(end[0]-start[0])} height={Math.abs(end[1]-start[1])} />;
        if (item.kind === 'ellipse') return <ellipse key={item.id} {...common} cx={(start[0]+end[0])/2} cy={(start[1]+end[1])/2} rx={Math.abs(end[0]-start[0])/2} ry={Math.abs(end[1]-start[1])/2} />;
        return <polyline key={item.id} {...common} points={(item.points.length === 1 ? [start, [start[0]+0.01,start[1]]] : item.points).map(p => p.join(',')).join(' ')} strokeLinecap="round" strokeLinejoin="round" />;
      })}
    </svg>
  </div>;
}
