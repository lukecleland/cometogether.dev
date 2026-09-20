export interface BoardItem {
  id: string;
  kind: 'pen' | 'rectangle' | 'ellipse' | 'text';
  points: [number, number][];
  color: string;
  width: number;
  text?: string;
}
export interface BoardContent { items: BoardItem[]; deleted: string[] }
export type BoardChange = { item: BoardItem } | { remove: string[] };
export const emptyBoard = (): BoardContent => ({ items: [], deleted: [] });

export function validBoardItem(value: unknown): value is BoardItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as BoardItem;
  return typeof item.id === 'string' && ['pen', 'rectangle', 'ellipse', 'text'].includes(item.kind)
    && /^#[0-9a-f]{6}$/i.test(item.color) && Number.isFinite(item.width) && item.width >= 1 && item.width <= 24
    && Array.isArray(item.points) && item.points.length > 0 && item.points.length <= 2000
    && item.points.every(p => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && n >= 0 && n <= 1000))
    && (item.text === undefined || (typeof item.text === 'string' && item.text.length <= 1000));
}
export function validBoard(value: unknown): value is BoardContent {
  if (!value || typeof value !== 'object') return false;
  const board = value as BoardContent;
  return Array.isArray(board.items) && board.items.every(validBoardItem)
    && Array.isArray(board.deleted) && board.deleted.every(id => typeof id === 'string');
}
export function changeBoard(content: BoardContent | undefined, change: BoardChange): BoardContent {
  const board = content ?? emptyBoard();
  if ('remove' in change) {
    if (!Array.isArray(change.remove) || !change.remove.every(id => typeof id === 'string')) return board;
    const deleted = [...new Set([...board.deleted, ...change.remove])].sort();
    return { items: board.items.filter(item => !deleted.includes(item.id)), deleted };
  }
  if (!validBoardItem(change.item) || board.deleted.includes(change.item.id)) return board;
  const existing = board.items.find(item => item.id === change.item.id);
  // Pen strokes grow monotonically. Ignore an older in-flight segment.
  if (existing?.kind === 'pen' && existing.points.length > change.item.points.length) return board;
  const items = [...board.items.filter(item => item.id !== change.item.id), change.item].sort((a, b) => a.id.localeCompare(b.id));
  return { ...board, items };
}
