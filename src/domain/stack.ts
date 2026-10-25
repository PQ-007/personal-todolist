import { DEFAULT_COLOR } from './colors';
import { addDays, addMin, overlapsDay, startOfDay } from './dates';
import type { Label } from './labels';
import type { NewTask, Task } from './types';

/** A to-do without a time yet. It becomes a calendar task once it is scheduled. */
export interface StackItem {
  id: string;
  title: string;
  /** Markdown notes, kept when the item moves to and from the calendar. */
  description: string;
  colorId: string;
  label?: Label;
  tags?: string[];
  /** Estimated length in minutes; the calendar block gets this length. */
  minutes: number;
}

export const DEFAULT_MINUTES = 30;
/** Lengths offered in the item menu. */
export const LENGTHS = [15, 30, 45, 60, 90, 120];


/** A stack item for a calendar task moved back to the stack; timed tasks keep their length. */
export function itemFromTask(t: Task, id: string): StackItem {
  const minutes = t.allDay ? DEFAULT_MINUTES : Math.max(15, Math.round((t.end.getTime() - t.start.getTime()) / 60000));
  return { id, title: t.title, description: t.description, colorId: t.colorId, label: t.label, tags: t.tags, minutes };
}

/** The calendar task for a stack item placed at `start`, or on that day when `allDay`. */
export function taskFromItem(item: StackItem, start: Date, allDay = false): NewTask {
  const base = {
    title: item.title,
    description: item.description,
    colorId: item.colorId || DEFAULT_COLOR,
    label: item.label,
    tags: item.tags,
    done: false,
  };
  if (allDay) {
    const day = startOfDay(start);
    return { ...base, allDay: true, start: day, end: addDays(day, 1) };
  }
  return { ...base, allDay: false, start, end: addMin(start, item.minutes) };
}

const WORK_START = 9 * 60;
const STEP = 15;
const DAY_MIN = 24 * 60;

/**
 * The earliest start on `day` with `minutes` free between its timed tasks, from 09:00 and
 * never in the past (rounded up to 15 minutes). When the working day is full this is simply
 * the first free time after the last task.
 */
export function nextFreeSlot(tasks: Task[], day: Date, minutes: number, now: Date): Date {
  const d = startOfDay(day);
  const minOf = (t: Date) => (t.getTime() - d.getTime()) / 60000;
  const busy = tasks
    .filter((t) => !t.allDay && overlapsDay(t, d))
    .map((t) => [Math.max(0, minOf(t.start)), Math.min(DAY_MIN, minOf(t.end))] as const)
    .sort((a, b) => a[0] - b[0]);
  let at = Math.max(WORK_START, Math.ceil(minOf(now) / STEP) * STEP);
  for (const [start, end] of busy) {
    if (start >= at + minutes) break;
    if (end > at) at = Math.ceil(end / STEP) * STEP;
  }
  return addMin(d, Math.min(at, DAY_MIN - minutes));
}
