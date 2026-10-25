import { addDays, mondayOf } from '../domain/dates';
import { WEEK_ORDER, type Repeat, type Weekday } from '../domain/recurrence';
import { fmtDate, getLang, t, type MsgKey } from '../i18n';

/** A date that falls on `wd`, for formatting weekday names in the current language. */
const dateOf = (wd: Weekday) => addDays(mondayOf(new Date(2026, 0, 5)), WEEK_ORDER.indexOf(wd));
export const weekdayName = (wd: Weekday, style: 'long' | 'short' | 'narrow' = 'long') => fmtDate(dateOf(wd), { weekday: style });

const NTH: Record<number, MsgKey> = { 1: 'rep.nth1', 2: 'rep.nth2', 3: 'rep.nth3', 4: 'rep.nth4', [-1]: 'rep.nthLast' };

/** "Weekly on Thursday", "Every 2 months on the last Friday, until Dec 31"… in the current language. */
export function describeRepeat(r: Repeat | null, start: Date): string {
  if (!r) return t('rep.none');
  if (r.unsupported) return t('rep.unsupported');
  const n = r.interval;
  let text: string;
  switch (r.freq) {
    case 'DAILY':
      text = n > 1 ? t('rep.everyDays', { n }) : t('rep.daily');
      break;
    case 'WEEKLY': {
      const days = r.byDay?.length ? WEEK_ORDER.filter((d) => r.byDay!.includes(d)) : [WEEK_ORDER[(start.getDay() + 6) % 7]!];
      if (n === 1 && days.join() === 'MO,TU,WE,TH,FR') text = t('rep.weekdays');
      else {
        const names = days.map((d) => weekdayName(d, days.length > 2 ? 'short' : 'long')).join(getLang() === 'ja' ? '、' : ', ');
        text = n > 1 ? t('rep.everyWeeks', { n, days: names }) : t('rep.weekly', { days: names });
      }
      break;
    }
    case 'MONTHLY':
      if (r.nth) {
        const parts = { n, nth: t(NTH[r.nth.n] ?? 'rep.nthLast'), day: weekdayName(r.nth.day) };
        text = n > 1 ? t('rep.everyMonthsNth', parts) : t('rep.monthlyNth', parts);
      } else text = n > 1 ? t('rep.everyMonthsDay', { n, d: start.getDate() }) : t('rep.monthlyDay', { d: start.getDate() });
      break;
    case 'YEARLY': {
      const date = fmtDate(start, { month: 'long', day: 'numeric' });
      text = n > 1 ? t('rep.everyYears', { n, date }) : t('rep.yearly', { date });
      break;
    }
  }
  if (r.count) text += t('rep.times', { n: r.count });
  else if (r.until) text += t('rep.until', { date: fmtDate(r.until, { month: 'short', day: 'numeric', year: 'numeric' }) });
  return text;
}
