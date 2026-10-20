export const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Parses `YYYY-MM-DD` as local midnight. */
export function parseYmd(s: string): Date {
  const [y = 1970, m = 1, d = 1] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Parses `HH:MM`; falls back when empty or malformed. */
export function parseHm(s: string, fallback: [number, number]): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  return m ? [Number(m[1]), Number(m[2])] : fallback;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export const addMin = (d: Date, n: number) => new Date(d.getTime() + n * 60000);
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Monday 00:00 of the week containing `d`. */
export const mondayOf = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
export const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
/** `d` itself on a workday; the following Monday on a weekend. */
export const nearestWorkday = (d: Date) => startOfDay(isWeekend(d) ? addDays(d, d.getDay() === 6 ? 2 : 1) : d);
/** Moves `n` workdays forward (or back), skipping weekends. */
export function stepWorkday(d: Date, n: number): Date {
  let x = startOfDay(d);
  for (let left = Math.abs(n); left > 0; ) {
    x = addDays(x, Math.sign(n));
    if (!isWeekend(x)) left--;
  }
  return x;
}
export const sameDay = (a: Date, b: Date) => ymd(a) === ymd(b);
/** Calendar-day difference, safe across DST changes. */
export const dayDiff = (a: Date, b: Date) =>
  Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 864e5);
export const withTime = (day: Date, h: number, m: number) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);

export const overlapsDay = (e: { start: Date; end: Date }, day: Date) =>
  e.start < addDays(day, 1) && e.end > day;
