import { FENCE, splitLines } from './parse';

const CHECKBOX = /^(\s*[-*+]\s+)\[( |x|X)\]/;

/** Flips the checklist item on source line `idx`. Other lines are left untouched. */
export function toggleTaskLine(md: string, idx: number): string {
  const lines = splitLines(md);
  const ln = lines[idx];
  if (ln != null) lines[idx] = ln.replace(CHECKBOX, (_, p: string, c: string) => `${p}[${c === ' ' ? 'x' : ' '}]`);
  return lines.join('\n');
}

/** Unticks every checklist item (outside code fences), for a fresh copy of a task. */
export function uncheckAll(md: string): string {
  let fence = false;
  return splitLines(md)
    .map((ln) => {
      if (FENCE.test(ln)) fence = !fence;
      return fence ? ln : ln.replace(CHECKBOX, '$1[ ]');
    })
    .join('\n');
}

/** Counts checklist items (outside code fences): `t` total, `d` done. */
export function countTasks(md: string): { t: number; d: number } {
  let t = 0;
  let d = 0;
  let fence = false;
  for (const ln of splitLines(md || '')) {
    if (FENCE.test(ln)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const m = ln.match(CHECKBOX);
    if (m) {
      t++;
      if (m[2] !== ' ') d++;
    }
  }
  return { t, d };
}

export type PreviewLine = { k: 'task'; done: boolean; t: string } | { k: 'text' | 'head'; t: string };

const plain = (s: string) => s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');

/** The first `max` meaningful lines of a memo, for card previews. Code blocks are skipped. */
export function previewLines(md: string, max = 10): PreviewLine[] {
  const out: PreviewLine[] = [];
  let fence = false;
  for (const raw of splitLines(md || '')) {
    if (FENCE.test(raw)) {
      fence = !fence;
      continue;
    }
    if (fence || !raw.trim()) continue;
    let m: RegExpMatchArray | null;
    if ((m = raw.match(/^\s*[-*+]\s+\[( |x|X)\]\s*(.*)$/))) {
      if (m[2]!.trim()) out.push({ k: 'task', done: m[1] !== ' ', t: plain(m[2]!) });
    } else if ((m = raw.match(/^\s*[-*+]\s+(.*)$/))) out.push({ k: 'text', t: '• ' + plain(m[1]!) });
    else if ((m = raw.match(/^\s*#{1,6}\s+(.*)$/))) out.push({ k: 'head', t: plain(m[1]!) });
    else out.push({ k: 'text', t: plain(raw.replace(/^\s*>\s?/, '').trim()) });
    if (out.length >= max) break;
  }
  return out;
}
