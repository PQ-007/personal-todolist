import { addDays, startOfDay } from './dates';
import type { Label } from './labels';
import type { Task } from './types';

export interface Tally {
  done: number;
  total: number;
}

export interface WeekReview extends Tally {
  /** One entry per day of the week, Monday first. */
  days: (Tally & { day: Date })[];
  byLabel: (Tally & { label: Label | null })[];
}

const tally = (tasks: Task[]): Tally => ({ done: tasks.filter((t) => t.done).length, total: tasks.length });

/**
 * How the 7 days from `monday` went. A task counts once, on the day it starts (a multi-day
 * task isn't counted again on each day).
 */
export function weekReview(tasks: Task[], monday: Date): WeekReview {
  const from = startOfDay(monday);
  const to = addDays(from, 7);
  const week = tasks.filter((t) => t.start >= from && t.start < to);
  const labels: (Label | null)[] = ['work', 'personal', null];
  return {
    ...tally(week),
    days: Array.from({ length: 7 }, (_, i) => {
      const day = addDays(from, i);
      return { day, ...tally(week.filter((t) => t.start >= day && t.start < addDays(day, 1))) };
    }),
    byLabel: labels.map((label) => ({ label, ...tally(week.filter((t) => (t.label ?? null) === label)) })).filter((l) => l.total > 0),
  };
}

export interface Streak {
  seriesId: string;
  title: string;
  colorId: string;
  /** Occurrences done in a row, up to the latest one that's due. */
  current: number;
  /** The longest run in the tasks given. */
  best: number;
}

/**
 * Runs of done occurrences for each repeating task, from the occurrences in `tasks` that have
 * started by `now`. Today's occurrence counts once it's done, but doesn't break the run while
 * it's still open. Longest current run first; series never done are left out.
 */
export function streaks(tasks: Task[], now: Date): Streak[] {
  const today = startOfDay(now);
  const bySeries = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.seriesId || t.start > now) continue;
    bySeries.set(t.seriesId, [...(bySeries.get(t.seriesId) ?? []), t]);
  }
  const out: Streak[] = [];
  for (const [seriesId, occ] of bySeries) {
    occ.sort((a, b) => a.start.getTime() - b.start.getTime());
    let run = 0;
    let best = 0;
    for (const t of occ) {
      run = t.done ? run + 1 : 0;
      best = Math.max(best, run);
    }
    const last = occ[occ.length - 1]!;
    // Still open today: the run up to yesterday stands.
    if (!last.done && last.start >= today) {
      run = 0;
      for (let i = occ.length - 2; i >= 0 && occ[i]!.done; i--) run++;
    }
    if (best > 0) out.push({ seriesId, title: last.title, colorId: last.colorId, current: run, best });
  }
  return out.sort((a, b) => b.current - a.current || b.best - a.best);
}
