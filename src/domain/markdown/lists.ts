import { splitLines } from './parse';

const ITEM = /^(\s*)([-*+]|\d+[.)])\s/;
const NUMBER = /^(\s*)\d+([.)])/;

const width = (ws: string) => ws.replace(/\t/g, '    ').length;
const itemIndent = (ln: string | undefined) => {
  const m = ln == null ? null : ITEM.exec(ln);
  return m ? width(m[1]!) : null;
};

/** The lines an item spans: the item and the more indented items under it. */
function itemEnd(lines: string[], i: number): number {
  const own = itemIndent(lines[i])!;
  let end = i + 1;
  while (end < lines.length) {
    const ind = itemIndent(lines[end]);
    if (ind == null || ind <= own) break;
    end++;
  }
  return end;
}

/** Renumbers the numbered items of the list around line `at`: 1, 2, 3… per level. */
function renumber(lines: string[], at: number) {
  let first = at;
  while (first > 0 && itemIndent(lines[first - 1]) != null) first--;
  const counters = new Map<number, number>();
  for (let i = first; i < lines.length && itemIndent(lines[i]) != null; i++) {
    const ind = itemIndent(lines[i])!;
    for (const k of [...counters.keys()]) if (k > ind) counters.delete(k);
    const m = NUMBER.exec(lines[i]!);
    if (!m) {
      counters.delete(ind);
      continue;
    }
    const n = (counters.get(ind) ?? 0) + 1;
    counters.set(ind, n);
    lines[i] = lines[i]!.replace(NUMBER, `$1${n}$2`);
  }
}

/**
 * Moves the list item on source line `from` (with its sub-items) before or after the item on
 * line `to` (after means after that item's sub-items too). It takes the target's indentation,
 * and numbered lists are renumbered. Returns the source unchanged when the move makes no sense.
 */
export function moveListItem(md: string, from: number, to: number, place: 'before' | 'after'): string {
  const lines = splitLines(md);
  const srcIndent = itemIndent(lines[from]);
  const dstIndent = itemIndent(lines[to]);
  if (srcIndent == null || dstIndent == null) return md;
  const end = itemEnd(lines, from);
  // Not into itself.
  if (to >= from && to < end) return md;
  const shift = dstIndent - srcIndent;
  const block = lines.slice(from, end).map((ln) => (shift > 0 ? ' '.repeat(shift) + ln : ln.slice(Math.min(-shift, width(/^\s*/.exec(ln)![0])))));
  let at = place === 'before' ? to : itemEnd(lines, to);
  lines.splice(from, end - from);
  if (at > from) at -= end - from;
  lines.splice(at, 0, ...block);
  renumber(lines, at);
  if (from < lines.length && itemIndent(lines[from]) != null) renumber(lines, from);
  return lines.join('\n');
}
