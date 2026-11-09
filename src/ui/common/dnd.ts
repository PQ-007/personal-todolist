import type { StackItem } from '../domain/stack';

/**
 * The to-do being dragged from the stack. HTML drag data can't be read during dragover, so
 * the calendar reads this to draw a preview of the block (its length and color) under the pointer.
 */
export const stackDrag: { item: StackItem | null } = { item: null };

/** Drag data type for stack items, so other drags (files, text) are ignored. */
export const STACK_MIME = 'application/x-planner-stack';

export const isStackDrag = (e: { dataTransfer: DataTransfer | null }) =>
  !!stackDrag.item && !!e.dataTransfer?.types.includes(STACK_MIME);

/** True when the point is over the stack panel (used while dragging a calendar card). */
export function overStack(x: number, y: number): boolean {
  const r = document.querySelector('.stack')?.getBoundingClientRect();
  return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}
