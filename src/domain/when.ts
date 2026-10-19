import { addDays, dayDiff, hm, parseHm, parseYmd, withTime, ymd } from './dates';

/**
 * The date/time fields of the task modal. `endDate` is inclusive for all-day tasks (what a
 * person reads) and is the actual end day for timed tasks, so multi-day events survive edits.
 */
export interface WhenForm {
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}

export function formFromTask(t: { start: Date; end: Date; allDay: boolean }): WhenForm {
  return {
    allDay: t.allDay,
    startDate: ymd(t.start),
    startTime: t.allDay ? '09:00' : hm(t.start),
    // All-day ends are exclusive; show the last day.
    endDate: ymd(t.allDay ? addDays(t.end, -1) : t.end),
    endTime: t.allDay ? '10:00' : hm(t.end),
  };
}

export function rangeFromForm(f: WhenForm): { start: Date; end: Date; allDay: boolean } {
  const sd = parseYmd(f.startDate);
  const ed = f.endDate ? parseYmd(f.endDate) : sd;
  if (f.allDay) {
    const last = ed < sd ? sd : ed;
    return { allDay: true, start: sd, end: addDays(last, 1) };
  }
  const [sh, sm] = parseHm(f.startTime, [9, 0]);
  const [eh, em] = parseHm(f.endTime, [10, 0]);
  return { allDay: false, start: withTime(sd, sh, sm), end: withTime(ed, eh, em) };
}

/** Changing the start date moves the end date by the same number of days. */
export function setStartDate(f: WhenForm, startDate: string): WhenForm {
  if (!startDate || !f.startDate) return { ...f, startDate };
  const delta = dayDiff(parseYmd(f.startDate), parseYmd(startDate));
  const endDate = f.endDate ? ymd(addDays(parseYmd(f.endDate), delta)) : startDate;
  return { ...f, startDate, endDate };
}

/** Toggling all-day collapses to a single day, like the prototype; the time fields are kept. */
export function setAllDay(f: WhenForm, allDay: boolean): WhenForm {
  return allDay === f.allDay ? f : { ...f, allDay, endDate: f.startDate };
}

export const isMultiDay = (f: WhenForm) => f.endDate !== '' && f.endDate !== f.startDate;

/** Returns an error message, or null when the range is valid. */
export function validateRange(r: { start: Date; end: Date; allDay: boolean }): string | null {
  if (Number.isNaN(r.start.getTime()) || Number.isNaN(r.end.getTime())) return 'Pick a valid date and time.';
  if (!r.allDay && r.end <= r.start) return 'The end time must be after the start time.';
  return null;
}
