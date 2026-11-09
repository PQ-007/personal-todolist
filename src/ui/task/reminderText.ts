import { fmtDuration, t } from '../../i18n';

/** Reminder choices, in minutes before the start. */
export const TIMED_REMINDERS = [0, 5, 10, 15, 30, 60, 120, 1440];
/** All-day tasks start at midnight: 900 is 09:00 the day before, 2340 two days before. */
export const ALL_DAY_REMINDERS = [900, 2340];

const pad = (n: number) => String(n).padStart(2, '0');

/** "10m before", "1 day before", "The day before at 09:00"… in the current language. */
export function reminderText(minutes: number, allDay: boolean): string {
  if (allDay) {
    const days = Math.ceil(minutes / 1440);
    const at = days * 1440 - minutes;
    const time = `${pad(Math.floor(at / 60))}:${pad(at % 60)}`;
    if (days === 0) return t('rem.onDayAt', { time });
    return days === 1 ? t('rem.dayBeforeAt', { time }) : t('rem.daysBeforeAt', { n: days, time });
  }
  if (minutes === 0) return t('rem.atStart');
  if (minutes % 1440 === 0) return minutes === 1440 ? t('rem.dayBefore') : t('rem.daysBefore', { n: minutes / 1440 });
  return t('rem.before', { time: fmtDuration(minutes) });
}

/** A task's reminders as one line; unset means the calendar's defaults. */
export function remindersText(reminders: number[] | undefined, allDay: boolean): string {
  if (!reminders) return t('rem.default');
  if (!reminders.length) return t('rem.none');
  return reminders.map((m) => reminderText(m, allDay)).join(', ');
}
