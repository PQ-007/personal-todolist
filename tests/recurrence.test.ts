import { describe, expect, it } from 'vitest';
import { hm, ymd } from '../src/domain/dates';
import { nthOf, occurrences, parseRule, presetOf, presets, ruleLine, sameRepeat, type Repeat } from '../src/domain/recurrence';

const thu = new Date(2026, 9, 22, 9, 0); // Thursday, Oct 22 2026, 09:00
const hour = 3600_000;
const days = (r: Repeat, start: Date, from: Date, to: Date) => occurrences(r, start, hour, from, to).map(ymd);

describe('RRULE text', () => {
  it('reads what Google Calendar writes', () => {
    expect(parseRule(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'])).toEqual({ freq: 'WEEKLY', interval: 1, byDay: ['MO', 'WE', 'FR'] });
    expect(parseRule(['RRULE:FREQ=MONTHLY;BYDAY=4TH'])).toEqual({ freq: 'MONTHLY', interval: 1, nth: { n: 4, day: 'TH' } });
    expect(parseRule(['RRULE:FREQ=MONTHLY;BYDAY=-1FR'])).toEqual({ freq: 'MONTHLY', interval: 1, nth: { n: -1, day: 'FR' } });
    expect(parseRule(['RRULE:FREQ=DAILY;INTERVAL=2;COUNT=10'])).toEqual({ freq: 'DAILY', interval: 2, count: 10 });
    expect(parseRule(['EXDATE:20261023', 'RRULE:FREQ=YEARLY'])).toEqual({ freq: 'YEARLY', interval: 1 });
    expect(parseRule(undefined)).toBeNull();
  });

  it('reads both UNTIL forms as a local day', () => {
    expect(ymd(parseRule(['RRULE:FREQ=DAILY;UNTIL=20261231'])!.until!)).toBe('2026-12-31');
    expect(parseRule(['RRULE:FREQ=DAILY;UNTIL=20261231T120000Z'])!.until).toBeInstanceOf(Date);
  });

  it('marks rules it cannot edit', () => {
    expect(parseRule(['RRULE:FREQ=MONTHLY;BYMONTHDAY=1,15'])!.unsupported).toBe(true);
    expect(parseRule(['RRULE:FREQ=HOURLY'])!.unsupported).toBe(true);
  });

  it('writes rules Google accepts and reads them back', () => {
    const r: Repeat = { freq: 'WEEKLY', interval: 2, byDay: ['FR', 'MO'], count: 6 };
    expect(ruleLine(r, false)).toBe('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;COUNT=6');
    expect(parseRule([ruleLine(r, false)])).toEqual({ ...r, byDay: ['MO', 'FR'] });
    expect(ruleLine({ freq: 'DAILY', interval: 1, until: new Date(2026, 11, 31) }, true)).toBe('RRULE:FREQ=DAILY;UNTIL=20261231');
    expect(ruleLine({ freq: 'DAILY', interval: 1, until: new Date(2026, 11, 31) }, false)).toMatch(/^RRULE:FREQ=DAILY;UNTIL=2026\d{4}T\d{6}Z$/);
  });
});

describe('presets', () => {
  it('match Google Calendar’s menu for a Thursday', () => {
    const p = Object.fromEntries(presets(thu).map((x) => [x.id, x.repeat]));
    expect(p.weekly).toEqual({ freq: 'WEEKLY', interval: 1, byDay: ['TH'] });
    expect(p.monthly).toEqual({ freq: 'MONTHLY', interval: 1, nth: { n: 4, day: 'TH' } });
    expect(p.weekdays!.byDay).toEqual(['MO', 'TU', 'WE', 'TH', 'FR']);
  });

  it('recognise a stored rule as a preset', () => {
    expect(presetOf(parseRule(['RRULE:FREQ=WEEKLY;BYDAY=TH']), thu)).toBe('weekly');
    expect(presetOf(parseRule(['RRULE:FREQ=WEEKLY']), thu)).toBe('weekly');
    expect(presetOf(parseRule(['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR']), thu)).toBe('weekdays');
    expect(presetOf(parseRule(['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TH']), thu)).toBeNull();
    expect(presetOf(null, thu)).toBe('none');
    expect(sameRepeat({ freq: 'DAILY', interval: 1 }, { freq: 'DAILY', interval: 1, count: 3 }, thu)).toBe(false);
  });

  it('uses "last" for a fifth weekday', () => {
    expect(nthOf(new Date(2026, 9, 29))).toBe(-1);
    expect(nthOf(new Date(2026, 9, 1))).toBe(1);
  });
});

describe('occurrences', () => {
  const nov = [new Date(2026, 10, 1), new Date(2026, 11, 1)] as const;

  it('repeats daily and weekly, keeping the time of day', () => {
    const daily = occurrences({ freq: 'DAILY', interval: 1 }, thu, hour, new Date(2026, 9, 22), new Date(2026, 9, 25));
    expect(daily.map((d) => `${ymd(d)} ${hm(d)}`)).toEqual(['2026-10-22 09:00', '2026-10-23 09:00', '2026-10-24 09:00']);
    expect(days({ freq: 'WEEKLY', interval: 1, byDay: ['MO', 'WE'] }, thu, new Date(2026, 9, 19), new Date(2026, 10, 2))).toEqual([
      '2026-10-26',
      '2026-10-28',
    ]);
    expect(days({ freq: 'WEEKLY', interval: 2 }, thu, new Date(2026, 9, 1), new Date(2026, 10, 20))).toEqual(['2026-10-22', '2026-11-05', '2026-11-19']);
  });

  it('repeats monthly on a weekday or a date', () => {
    expect(days({ freq: 'MONTHLY', interval: 1, nth: { n: 4, day: 'TH' } }, thu, ...nov)).toEqual(['2026-11-26']);
    expect(days({ freq: 'MONTHLY', interval: 1, nth: { n: -1, day: 'FR' } }, thu, ...nov)).toEqual(['2026-11-27']);
    // The 31st only happens in months that have one.
    const d31 = new Date(2026, 9, 31, 9);
    expect(days({ freq: 'MONTHLY', interval: 1 }, d31, new Date(2026, 9, 1), new Date(2027, 1, 1))).toEqual(['2026-10-31', '2026-12-31', '2027-01-31']);
  });

  it('stops after COUNT or on UNTIL, and never starts before the series', () => {
    expect(days({ freq: 'DAILY', interval: 1, count: 3 }, thu, new Date(2026, 9, 1), new Date(2026, 11, 1))).toEqual([
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
    ]);
    // COUNT counts from the series start, even when the range starts later.
    expect(days({ freq: 'DAILY', interval: 1, count: 3 }, thu, new Date(2026, 9, 24), new Date(2026, 11, 1))).toEqual(['2026-10-24']);
    expect(days({ freq: 'DAILY', interval: 1, until: new Date(2026, 9, 23) }, thu, new Date(2026, 9, 1), new Date(2026, 11, 1))).toEqual([
      '2026-10-22',
      '2026-10-23',
    ]);
  });
});
