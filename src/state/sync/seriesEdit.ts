import { addDays, dayDiff, startOfDay, withTime } from '../../domain/dates';
import { shiftRule, splitRule } from '../../domain/recurrence';
import type { NewTask, Task } from '../../domain/types';

/**
 * What an edit to a repeating task beyond one occurrence does to its series. Pure: the same
 * functions make the preview shown at once and the change that is saved.
 */

/**
 * An edit to a repeating task beyond one occurrence, given the series as it is: its content and
 * times as edited on the occurrence, and its rule (none: it stops repeating).
 */
export type SeriesEdit = (series: Task) => { next: NewTask; recurrence: string[] | undefined };

/** Two RRULE line lists say the same thing, as written. */
export const sameLines = (a: readonly string[] | undefined, b: readonly string[]) => a === b || a?.join('\n') === b.join('\n');

/** A task that doesn't repeat and isn't an occurrence. */
export const plainTask = (t: NewTask): NewTask => ({ ...t, recurrence: undefined, seriesId: undefined, originalStart: undefined, occurrenceKeys: undefined });

/**
 * "All of them": the series takes the edited fields, time of day and length, and moves by as
 * many days as `occurrence` did (an unchanged rule moves with it, see `shiftRule`). Null when
 * it stops repeating; `next` is then what the single task left in its place should be.
 */
export function editSeries(series: Task, occurrence: Task, edit: SeriesEdit): { series: Task | null; next: NewTask } {
  const { next, recurrence: rule } = edit(series);
  let recurrence = rule;
  const day = addDays(startOfDay(series.start), dayDiff(occurrence.start, next.start));
  if (series.recurrence && sameLines(recurrence, series.recurrence)) recurrence = shiftRule(series.recurrence, occurrence.start, next.start);
  if (!recurrence?.length) return { series: null, next };
  const start = next.allDay ? day : withTime(day, next.start.getHours(), next.start.getMinutes());
  const end = next.allDay ? addDays(day, Math.max(1, dayDiff(next.start, next.end))) : new Date(start.getTime() + (next.end.getTime() - next.start.getTime()));
  const { title, description, colorId, label, tags, allDay, reminders } = next;
  return { series: { ...series, title, description, colorId, label, tags, allDay, reminders, start, end, recurrence }, next };
}

/**
 * "This and following": the series stops the day before `occurrence` (`before`, its new rule),
 * and a new series starts there with the edit (`rest`; no rule makes it a single task).
 */
export function splitSeries(series: Task, occurrence: Task, edit: SeriesEdit): { before: string[]; rest: NewTask } {
  const { next, recurrence } = edit(series);
  const at = occurrence.originalStart ?? occurrence.start;
  const split = splitRule(series.recurrence ?? [], series.start, at, series.allDay);
  // An unchanged rule continues where the old series stops (a COUNT counts what is left),
  // moved to the day this occurrence moved to.
  const rule = series.recurrence && sameLines(recurrence, series.recurrence) ? shiftRule(split.after, occurrence.start, next.start) : recurrence;
  return { before: split.before, rest: { ...plainTask(next), done: false, recurrence: rule } };
}

/**
 * Whether the edited series differs only in content (title, notes, color, label, tags,
 * reminders): same rule and times, so the occurrences on screen can simply take it.
 */
export function contentOnly(before: Task, after: Task): boolean {
  return (
    !!before.recurrence &&
    !!after.recurrence &&
    sameLines(after.recurrence, before.recurrence) &&
    after.allDay === before.allDay &&
    after.start.getTime() === before.start.getTime() &&
    after.end.getTime() === before.end.getTime()
  );
}

/** The fields `contentOnly` edits change. */
export const contentOf = ({ title, description, colorId, label, tags, reminders }: Task) => ({ title, description, colorId, label, tags, reminders });
