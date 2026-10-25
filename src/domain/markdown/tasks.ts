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

/** Which checklist items (outside code fences) are ticked, in order: "101". */
export function checklistState(md: string): string {
  let out = '';
  let fence = false;
  for (const ln of splitLines(md || '')) {
    if (FENCE.test(ln)) fence = !fence;
    const m = fence ? null : ln.match(CHECKBOX);
    if (m) out += m[2] === ' ' ? '0' : '1';
  }
  return out;
}

/** Ticks the checklist items as `checklistState` described them; items beyond it are left as they are. */
export function applyChecklistState(md: string, state: string): string {
  let i = 0;
  let fence = false;
  return splitLines(md)
    .map((ln) => {
      if (FENCE.test(ln)) fence = !fence;
      if (fence || !CHECKBOX.test(ln)) return ln;
      const tick = state[i++];
      return tick == null ? ln : ln.replace(CHECKBOX, `$1[${tick === '1' ? 'x' : ' '}]`);
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
