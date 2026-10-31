import { addDays, addMin, dayDiff, hm, parseYmd, startOfDay, withTime, ymd } from './dates';
import type { WhenForm } from './when';

/**
 * A date or time written in a new task's title, such as "Gym tomorrow 7pm", "Call Ann fri
 * 9:30-10", "Report nov 5", "明日 19時 ジム" or "маргааш 10:00 уулзалт". The add dialog offers
 * it as a suggestion; nothing is applied unless the person keeps it.
 */
export interface DateHint {
  /** The title without the date and time words. */
  title: string;
  day?: Date;
  start?: [number, number];
  end?: [number, number];
}

// \b only knows ASCII letters, so words are bounded by "not a letter or digit" instead.
const B = '(?<![\\p{L}\\p{N}])';
const E = '(?![\\p{L}\\p{N}])';
const re = (src: string) => new RegExp(B + '(?:' + src + ')' + E, 'iu');

/** Indexed by Date.getDay(): Sunday first. */
const WEEKDAYS = ['sun(?:day)?', 'mon(?:day)?', 'tue(?:s|sday)?', 'wed(?:nesday)?', 'thu(?:r|rs|rsday)?', 'fri(?:day)?', 'sat(?:urday)?'].map((src) =>
  re(`(?:next\\s+|on\\s+)?${src}`),
);

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = `(${MONTHS.join('|')})[a-z]*\\.?`;
const ORD = '(?:st|nd|rd|th)?';

/** Words for a day relative to today: "today", "tmr", "明後日", "нөгөөдөр"… */
const RELATIVE: [RegExp, number][] = [
  [re('today|tonight|өнөөдөр'), 0],
  [re('tomorrow|tmrw?|маргааш'), 1],
  [re('нөгөөдөр'), 2],
  [re('next\\s+week|in\\s+a\\s+week'), 7],
];
// Japanese has no spaces, so its words can't require a boundary.
const JA_RELATIVE: [RegExp, number][] = [
  [/明後日/u, 2],
  [/明日/u, 1],
  [/今日/u, 0],
];

/** 12-hour clock: "7pm" is 19:00, "12am" midnight. */
function to24(h: number, ampm: string | undefined): number {
  if (!ampm) return h;
  const pm = ampm.toLowerCase() === 'pm';
  return (h % 12) + (pm ? 12 : 0);
}

const valid = ([h, m]: [number, number]) => h >= 0 && h < 24 && m >= 0 && m < 60;

interface Found {
  match: string;
  index: number;
}

function findDay(text: string, now: Date): (Found & { day: Date }) | null {
  const today = startOfDay(now);
  for (const [rx, n] of [...JA_RELATIVE, ...RELATIVE]) {
    const m = rx.exec(text);
    if (m) return { match: m[0], index: m.index, day: addDays(today, n) };
  }
  const inDays = re('in\\s+(\\d{1,2})\\s+days?').exec(text);
  if (inDays) return { match: inDays[0], index: inDays.index, day: addDays(today, Number(inDays[1])) };
  for (const [wd, rx] of WEEKDAYS.entries()) {
    const m = rx.exec(text);
    // The coming one, never today: "fri" said on a Friday means next week.
    if (m) return { match: m[0], index: m.index, day: addDays(today, ((wd - today.getDay() + 6) % 7) + 1) };
  }
  const md = re(`(?:on\\s+)?${MONTH}\\s+(\\d{1,2})${ORD}`).exec(text);
  const dm = md ? null : re(`(?:on\\s+)?(\\d{1,2})${ORD}\\s+${MONTH}`).exec(text);
  const hit = md ?? dm;
  if (hit) {
    const month = MONTHS.indexOf((md ? hit[1] : hit[2])!.slice(0, 3).toLowerCase());
    const date = Number(md ? hit[2] : hit[1]);
    let day = new Date(today.getFullYear(), month, date);
    if (day.getMonth() !== month) return null;
    // A date already past means next year's.
    if (day < today) day = new Date(today.getFullYear() + 1, month, date);
    return { match: hit[0], index: hit.index, day };
  }
  return null;
}

function findTime(text: string): (Found & { start: [number, number]; end?: [number, number] }) | null {
  // "9:30-11", "7-9pm", "10am-noon" is not supported; a range needs a colon or am/pm somewhere.
  const range = re('(?:at\\s+|from\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?\\s*(?:-|–|to)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?').exec(text);
  if (range && (range[2] || range[3] || range[5] || range[6])) {
    const endAmPm = range[6];
    // "7-9pm": the pm applies to both ends.
    const startAmPm = range[3] ?? (endAmPm && Number(range[1]) <= Number(range[4]) ? endAmPm : undefined);
    const start: [number, number] = [to24(Number(range[1]), startAmPm), Number(range[2] ?? 0)];
    const end: [number, number] = [to24(Number(range[4]), endAmPm), Number(range[5] ?? 0)];
    if (valid(start) && valid(end)) return { match: range[0], index: range.index, start, end };
  }
  const clock = re('(?:at\\s+)?(\\d{1,2}):(\\d{2})\\s*(am|pm)?').exec(text);
  if (clock) {
    const start: [number, number] = [to24(Number(clock[1]), clock[3]), Number(clock[2])];
    if (valid(start)) return { match: clock[0], index: clock.index, start };
  }
  const ampm = re('(?:at\\s+)?(\\d{1,2})\\s*(am|pm)').exec(text);
  if (ampm) {
    const start: [number, number] = [to24(Number(ampm[1]), ampm[2]), 0];
    if (valid(start)) return { match: ampm[0], index: ampm.index, start };
  }
  const ja = /(\d{1,2})時(?:(\d{1,2})分|(半))?/u.exec(text);
  if (ja) {
    const start: [number, number] = [Number(ja[1]), ja[3] ? 30 : Number(ja[2] ?? 0)];
    if (valid(start)) return { match: ja[0], index: ja.index, start };
  }
  return null;
}

/** Removes `found` from `text`, tidying the spaces (and a "-" or "," left dangling) around it. */
function cut(text: string, found: Found): string {
  return (text.slice(0, found.index) + ' ' + text.slice(found.index + found.match.length))
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/^[\s,–-]+|[\s,–-]+$/g, '');
}

export function parseDateHint(text: string, now: Date): DateHint | null {
  let title = text;
  const day = findDay(title, now);
  if (day) title = cut(title, day);
  const time = findTime(title);
  if (time) title = cut(title, time);
  if ((!day && !time) || !title) return null;
  return {
    title,
    ...(day ? { day: day.day } : {}),
    ...(time ? { start: time.start, ...(time.end ? { end: time.end } : {}) } : {}),
  };
}

/** The dialog's date fields with `hint` applied; a start without an end keeps the current length. */
export function applyDateHint(f: WhenForm, hint: DateHint): WhenForm {
  const startDate = hint.day ? ymd(hint.day) : f.startDate;
  if (!hint.start) {
    const delta = dayDiff(parseYmd(f.startDate), parseYmd(startDate));
    return { ...f, startDate, endDate: ymd(addDays(parseYmd(f.endDate || f.startDate), delta)) };
  }
  const day = parseYmd(startDate);
  const start = withTime(day, ...hint.start);
  const oldStart = withTime(parseYmd(f.startDate), ...(f.startTime.split(':').map(Number) as [number, number]));
  const oldEnd = withTime(parseYmd(f.endDate || f.startDate), ...(f.endTime.split(':').map(Number) as [number, number]));
  const len = f.allDay ? 60 : Math.max(15, Math.round((oldEnd.getTime() - oldStart.getTime()) / 60000) || 60);
  let end = hint.end ? withTime(day, ...hint.end) : addMin(start, len);
  // "22:00-1:00" ends the next day.
  if (end <= start) end = addDays(end, 1);
  return { allDay: false, startDate, startTime: hm(start), endDate: ymd(end), endTime: hm(end) };
}
