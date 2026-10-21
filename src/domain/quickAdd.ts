import { addDays, addMin, withTime } from './dates';
import type { NewTask } from './types';
import { DEFAULT_COLOR } from './colors';

const TIMED = /^(\d{1,2})[:.](\d{2})(?:\s*[-–]\s*(\d{1,2})[:.](\d{2}))?\s+(.+)$/;

/**
 * Turns quick-add text into a task on `day`. A leading time makes it a timed task
 * ("14:00 Review PR" lasts an hour, "9:30-11:00 Review PR" sets both ends);
 * anything else becomes an all-day task. Returns null for blank input.
 */
export function parseQuickAdd(text: string, day: Date): NewTask | null {
  const s = text.trim();
  if (!s) return null;
  const base = { description: '', colorId: DEFAULT_COLOR, done: false };
  const m = TIMED.exec(s);
  const [h1, m1, h2, m2] = m ? [m[1], m[2], m[3], m[4]].map((x) => (x == null ? undefined : Number(x))) : [];
  if (m && h1! < 24 && m1! < 60 && (h2 == null || (h2 < 24 && m2! < 60))) {
    const start = withTime(day, h1!, m1!);
    const end = h2 == null ? addMin(start, 60) : withTime(day, h2, m2!);
    if (end > start) return { ...base, title: m[5]!.trim(), allDay: false, start, end };
  }
  return { ...base, title: s, allDay: true, start: day, end: addDays(day, 1) };
}
