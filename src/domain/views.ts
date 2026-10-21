import { addDays, dayDiff, mondayOf, startOfDay } from './dates';

/** "day" shows `span` consecutive days (1–7) starting at the selected day. */
export type View = 'day' | 'workweek' | 'week' | 'month';

export interface ViewSpec {
  view: View;
  /** The selected day. */
  day: Date;
  /** Number of columns in the day view. */
  span: number;
}

export interface DayRange {
  from: Date;
  days: number;
}

export const MAX_SPAN = 7;
export const clampSpan = (n: number) => Math.min(MAX_SPAN, Math.max(1, Math.round(n) || 1));

/** Same day of the month `n` months later, clamped to the month's last day (Jan 31 → Feb 28). */
export function addMonths(d: Date, n: number): Date {
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), last));
}

/** The whole weeks (Monday first) that cover the month of `d`: 4 to 6 rows. */
export function monthGrid(d: Date): DayRange {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const from = mondayOf(first);
  return { from, days: Math.ceil((dayDiff(from, last) + 1) / 7) * 7 };
}

/** The days a view shows. It always contains the selected day. */
export function visibleRange({ view, day, span }: ViewSpec): DayRange {
  const d = startOfDay(day);
  switch (view) {
    case 'day':
      return { from: d, days: clampSpan(span) };
    case 'workweek':
      return { from: mondayOf(d), days: 5 };
    case 'week':
      return { from: mondayOf(d), days: 7 };
    case 'month':
      return monthGrid(d);
  }
}

/** The selected day after pressing "next" (`n` = 1) or "previous" (`n` = -1). */
export function stepDay({ view, day, span }: ViewSpec, n: number): Date {
  if (view === 'month') return addMonths(day, n);
  return addDays(day, n * (view === 'day' ? clampSpan(span) : 7));
}

export const rangeDays = (r: DayRange) => Array.from({ length: r.days }, (_, i) => addDays(r.from, i));
export const sameRange = (a: DayRange, b: DayRange) => a.from.getTime() === b.from.getTime() && a.days === b.days;
