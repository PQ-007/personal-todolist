import { addDays, dayDiff, startOfDay, withTime } from './dates';
import { uncheckAll } from './markdown/tasks';
import type { NewTask, Task } from './types';

/** What "Copy" keeps: the task's content and length, not its identity or state. */
export function copyOf(t: Task): NewTask {
  return {
    title: t.title,
    description: t.description,
    colorId: t.colorId,
    label: t.label,
    done: false,
    allDay: t.allDay,
    start: t.start,
    end: t.end,
  };
}

/**
 * Places a copied task on `day`, keeping its length. A timed task starts at `time` when given
 * (a slot in the time grid), otherwise at its original time of day. All-day tasks stay all-day.
 */
export function placeCopy(src: NewTask, day: Date, time?: Date): NewTask {
  if (src.allDay) {
    const start = startOfDay(day);
    return { ...src, start, end: addDays(start, Math.max(1, dayDiff(src.start, src.end))) };
  }
  const start = time ?? withTime(day, src.start.getHours(), src.start.getMinutes());
  return { ...src, start, end: new Date(start.getTime() + (src.end.getTime() - src.start.getTime())) };
}

const sameSlot = (a: { title: string; start: Date }, b: { title: string; start: Date }) =>
  a.title === b.title && a.start.getTime() === b.start.getTime();

/**
 * Copies of the tasks that start in the `days` days from `from`, moved one week later, with
 * their checklists unticked.
 * Tasks already in the target week (same title and start, e.g. from an earlier copy or a
 * recurring event) are skipped, so copying twice adds nothing.
 */
export function weekCopies(source: Task[], existing: Task[], from: Date, days: number): NewTask[] {
  const to = addDays(from, days);
  return source
    .filter((t) => t.start >= from && t.start < to)
    .map((t) => ({ ...copyOf(t), description: uncheckAll(t.description), start: addDays(t.start, 7), end: addDays(t.end, 7) }))
    .filter((c) => !existing.some((e) => sameSlot(e, c)));
}
