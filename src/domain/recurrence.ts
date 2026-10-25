import { addDays, pad, startOfDay } from './dates';

/**
 * Repeating tasks, stored the way Google Calendar stores them: an RRULE line on the first
 * event of the series (RFC 5545). This handles the rules Google Calendar's own editor makes;
 * anything else is kept as written and shown as "custom".
 */
export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface Repeat {
  freq: Freq;
  /** Every `interval` days/weeks/months/years (1 = every). */
  interval: number;
  /** WEEKLY: the days of the week (defaults to the start's weekday). */
  byDay?: Weekday[];
  /** MONTHLY on the nth weekday: n = 1–4, or -1 for the last one. */
  nth?: { n: number; day: Weekday };
  /** Ends after this many occurrences… */
  count?: number;
  /** …or on this day (inclusive, local date). */
  until?: Date;
  /** The rule uses parts this app can't edit; it is kept unchanged unless replaced. */
  unsupported?: boolean;
}

/** Sunday-first, as Date#getDay. */
export const WEEKDAYS: Weekday[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
/** Monday-first, for pickers. */
export const WEEK_ORDER: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const WORKDAYS: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR'];

export const weekdayOf = (d: Date): Weekday => WEEKDAYS[d.getDay()]!;
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** Which weekday-of-the-month `d` is: 1–4, or -1 for a fifth one (which is always the last). */
export function nthOf(d: Date): number {
  const n = Math.ceil(d.getDate() / 7);
  return n >= 5 ? -1 : n;
}

/* ---------- RRULE text ---------- */

function parseUntil(v: string): Date | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  if (!m[4]) return new Date(y, mo, d);
  const t = m[7] ? new Date(Date.UTC(y, mo, d, +m[4], +m[5]!, +m[6]!)) : new Date(y, mo, d, +m[4], +m[5]!, +m[6]!);
  return startOfDay(t);
}

/** Reads the RRULE line of a series; null when there is none. */
export function parseRule(lines: readonly string[] | undefined): Repeat | null {
  const line = lines?.find((l) => l.toUpperCase().startsWith('RRULE:'));
  if (!line) return null;
  const parts = new Map(
    line
      .slice(6)
      .split(';')
      .map((p) => p.split('=') as [string, string])
      .map(([k, v]) => [k.toUpperCase(), v ?? ''] as const),
  );
  const freq = parts.get('FREQ') as Freq | undefined;
  if (!freq || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return { freq: 'DAILY', interval: 1, unsupported: true };
  const r: Repeat = { freq, interval: Math.max(1, Number(parts.get('INTERVAL') ?? 1) || 1) };
  const known = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'COUNT', 'UNTIL', 'WKST']);
  if ([...parts.keys()].some((k) => !known.has(k))) r.unsupported = true;
  const byDay = parts.get('BYDAY');
  if (byDay) {
    const days = byDay.split(',').map((s) => /^([+-]?\d)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(s.toUpperCase()));
    if (days.some((d) => !d)) r.unsupported = true;
    else if (freq === 'WEEKLY' && days.every((d) => !d![1])) r.byDay = days.map((d) => d![2] as Weekday);
    else if (freq === 'MONTHLY' && days.length === 1 && days[0]![1]) r.nth = { n: Number(days[0]![1]), day: days[0]![2] as Weekday };
    else r.unsupported = true;
  }
  if (parts.has('COUNT')) r.count = Math.max(1, Number(parts.get('COUNT')) || 1);
  if (parts.has('UNTIL')) r.until = parseUntil(parts.get('UNTIL')!);
  return r;
}

const ymdCompact = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

/** The RRULE line for `r`. All-day series end on a date; timed ones at the end of that day (UTC). */
export function ruleLine(r: Repeat, allDay: boolean): string {
  const p = [`FREQ=${r.freq}`];
  if (r.interval > 1) p.push(`INTERVAL=${r.interval}`);
  if (r.freq === 'WEEKLY' && r.byDay?.length) p.push(`BYDAY=${WEEK_ORDER.filter((d) => r.byDay!.includes(d)).join(',')}`);
  if (r.freq === 'MONTHLY' && r.nth) p.push(`BYDAY=${r.nth.n}${r.nth.day}`);
  if (r.count) p.push(`COUNT=${r.count}`);
  else if (r.until) {
    if (allDay) p.push(`UNTIL=${ymdCompact(r.until)}`);
    else {
      const end = new Date(r.until.getFullYear(), r.until.getMonth(), r.until.getDate(), 23, 59, 59);
      p.push(`UNTIL=${end.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`);
    }
  }
  return 'RRULE:' + p.join(';');
}

/* ---------- presets, like Google Calendar's menu ---------- */

export type PresetId = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays';

/** The quick choices for a task starting on `start`. */
export function presets(start: Date): { id: PresetId; repeat: Repeat | null }[] {
  return [
    { id: 'none', repeat: null },
    { id: 'daily', repeat: { freq: 'DAILY', interval: 1 } },
    { id: 'weekly', repeat: { freq: 'WEEKLY', interval: 1, byDay: [weekdayOf(start)] } },
    { id: 'monthly', repeat: { freq: 'MONTHLY', interval: 1, nth: { n: nthOf(start), day: weekdayOf(start) } } },
    { id: 'yearly', repeat: { freq: 'YEARLY', interval: 1 } },
    { id: 'weekdays', repeat: { freq: 'WEEKLY', interval: 1, byDay: [...WORKDAYS] } },
  ];
}

/** Two rules repeat the same way (WEEKLY without days means the start's weekday). */
export function sameRepeat(a: Repeat | null, b: Repeat | null, start: Date): boolean {
  if (!a || !b) return a === b;
  if (a.unsupported || b.unsupported) return false;
  const days = (r: Repeat) => (r.freq === 'WEEKLY' ? [...(r.byDay?.length ? r.byDay : [weekdayOf(start)])].sort().join() : '');
  return (
    a.freq === b.freq &&
    a.interval === b.interval &&
    days(a) === days(b) &&
    `${a.nth?.n}${a.nth?.day}` === `${b.nth?.n}${b.nth?.day}` &&
    (a.count ?? 0) === (b.count ?? 0) &&
    (a.until?.getTime() ?? 0) === (b.until?.getTime() ?? 0)
  );
}

/** Which preset `r` is, if any. */
export const presetOf = (r: Repeat | null, start: Date): PresetId | null =>
  presets(start).find((p) => sameRepeat(p.repeat, r, start))?.id ?? null;

/* ---------- occurrences (used where the store can't expand series itself) ---------- */

/** The day of a monthly occurrence in the month of `y`/`m`, or null when the month has none. */
function monthlyDay(r: Repeat, start: Date, y: number, m: number): number | null {
  if (!r.nth) return start.getDate() <= daysInMonth(y, m) ? start.getDate() : null;
  const want = WEEKDAYS.indexOf(r.nth.day);
  if (r.nth.n > 0) {
    const first = (want - new Date(y, m, 1).getDay() + 7) % 7;
    const d = 1 + first + (r.nth.n - 1) * 7;
    return d <= daysInMonth(y, m) ? d : null;
  }
  const lastDay = daysInMonth(y, m);
  return lastDay - ((new Date(y, m, lastDay).getDay() - want + 7) % 7);
}

/**
 * Start times of the occurrences of a series that begins at `start` and lasts `durationMs`,
 * for those overlapping [from, to). Counts (COUNT) are counted from the series start.
 */
export function occurrences(r: Repeat, start: Date, durationMs: number, from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const h = start.getHours();
  const min = start.getMinutes();
  const at = (y: number, m: number, d: number) => new Date(y, m, d, h, min);
  const lastDay = r.until ? addDays(startOfDay(r.until), 1) : null;
  let n = 0;
  /** Returns false to stop. */
  const take = (t: Date): boolean => {
    if (t < start) return true;
    if ((lastDay && t >= lastDay) || t >= to) return false;
    n++;
    if (r.count && n > r.count) return false;
    if (t.getTime() + durationMs > from.getTime()) out.push(t);
    return true;
  };
  const step = r.interval;
  for (let i = 0; i < 10000; i++) {
    if (r.freq === 'DAILY') {
      if (!take(at(start.getFullYear(), start.getMonth(), start.getDate() + i * step))) break;
    } else if (r.freq === 'WEEKLY') {
      const days = r.byDay?.length ? r.byDay : [weekdayOf(start)];
      const monday = addDays(startOfDay(start), -((start.getDay() + 6) % 7) + i * 7 * step);
      let go = true;
      for (const wd of WEEK_ORDER) {
        if (!days.includes(wd)) continue;
        const d = addDays(monday, WEEK_ORDER.indexOf(wd));
        if (!(go = take(at(d.getFullYear(), d.getMonth(), d.getDate())))) break;
      }
      if (!go) break;
    } else if (r.freq === 'MONTHLY') {
      const first = new Date(start.getFullYear(), start.getMonth() + i * step, 1);
      const d = monthlyDay(r, start, first.getFullYear(), first.getMonth());
      if (d !== null && !take(at(first.getFullYear(), first.getMonth(), d))) break;
    } else {
      const y = start.getFullYear() + i * step;
      if (start.getDate() <= daysInMonth(y, start.getMonth()) && !take(at(y, start.getMonth(), start.getDate()))) break;
    }
  }
  return out;
}
