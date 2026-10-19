/** A text edit: replace [from, to) with `text`, then put the caret at `caret`. */
export interface Edit {
  from: number;
  to: number;
  text: string;
  caret: number;
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)$/;
const lineStart = (v: string, pos: number) => v.lastIndexOf('\n', pos - 1) + 1;

/**
 * Enter inside a list item: continue the list (numbered items count up, checklist items get a
 * fresh `[ ]`). Enter on an empty item ends the list by removing its marker. Returns null when
 * the caret is not in a list item, so the default Enter applies.
 */
export function continueList(value: string, selStart: number, selEnd: number): Edit | null {
  if (selStart !== selEnd) return null;
  const ls = lineStart(value, selStart);
  const m = value.slice(ls, selStart).match(LIST_ITEM);
  if (!m) return null;
  const [, indent = '', marker = '', box, rest = ''] = m;
  if (!rest.trim()) return { from: ls, to: selStart, text: '', caret: ls };
  const next = /\d/.test(marker) ? `${parseInt(marker, 10) + 1}${marker.slice(-1)}` : marker;
  const text = `\n${indent}${next} ${box ? '[ ] ' : ''}`;
  return { from: selStart, to: selStart, text, caret: selStart + text.length };
}

/** Inserts `prefix` at the start of the caret's line (toolbar: checklist, bullet, heading). */
export function insertLinePrefix(value: string, selStart: number, prefix: string): Edit {
  const ls = lineStart(value, selStart);
  return { from: ls, to: ls, text: prefix, caret: selStart + prefix.length };
}

/** Wraps the selection in `mark` (toolbar: bold). With no selection the caret lands inside. */
export function wrapSelection(value: string, a: number, b: number, mark: string): Edit {
  const text = mark + value.slice(a, b) + mark;
  return { from: a, to: b, text, caret: a === b ? a + mark.length : a + text.length };
}

export const applyEdit = (value: string, e: Edit) => value.slice(0, e.from) + e.text + value.slice(e.to);
