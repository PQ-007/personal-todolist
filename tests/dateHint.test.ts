import { describe, expect, it } from 'vitest';
import { applyDateHint, parseDateHint } from '../src/domain/dateHint';
import { formFromTask } from '../src/domain/when';

// Thursday, October 29 2026.
const NOW = new Date(2026, 9, 29, 14, 0);
const day = (d: number, m = 9, y = 2026) => new Date(y, m, d);

describe('parseDateHint', () => {
  it('finds days', () => {
    expect(parseDateHint('Gym tomorrow', NOW)).toEqual({ title: 'Gym', day: day(30) });
    expect(parseDateHint('Call Ann on fri', NOW)).toEqual({ title: 'Call Ann', day: day(30) });
    // The same weekday means next week's.
    expect(parseDateHint('Review thursday', NOW)?.day).toEqual(day(5, 10));
    expect(parseDateHint('Taxes in 3 days', NOW)?.day).toEqual(day(1, 10));
    expect(parseDateHint('Report nov 5th', NOW)).toEqual({ title: 'Report', day: day(5, 10) });
    expect(parseDateHint('Party 2 Jan', NOW)?.day).toEqual(day(2, 0, 2027));
  });

  it('finds times and ranges', () => {
    expect(parseDateHint('Gym tomorrow 7pm', NOW)).toEqual({ title: 'Gym', day: day(30), start: [19, 0] });
    expect(parseDateHint('Standup at 9:30', NOW)).toEqual({ title: 'Standup', start: [9, 30] });
    expect(parseDateHint('Workshop 9:30-11', NOW)).toEqual({ title: 'Workshop', start: [9, 30], end: [11, 0] });
    expect(parseDateHint('Dinner 7-9pm', NOW)).toEqual({ title: 'Dinner', start: [19, 0], end: [21, 0] });
    expect(parseDateHint('12am backup', NOW)?.start).toEqual([0, 0]);
  });

  it('reads Japanese and Mongolian', () => {
    expect(parseDateHint('明日19時ジム', NOW)).toEqual({ title: 'ジム', day: day(30), start: [19, 0] });
    expect(parseDateHint('今日 9時半 会議', NOW)).toEqual({ title: '会議', day: day(29), start: [9, 30] });
    expect(parseDateHint('маргааш 10:00 уулзалт', NOW)).toEqual({ title: 'уулзалт', day: day(30), start: [10, 0] });
  });

  it('leaves ordinary titles alone', () => {
    for (const s of ['Read chapters 3-4', 'Monitor logs', 'Mondays plan', 'Pay 25 dollars', 'Meet at 5', 'tomorrow', 'Saturn V model']) {
      expect(parseDateHint(s, NOW), s).toBeNull();
    }
  });
});

describe('applyDateHint', () => {
  const form = formFromTask({ start: new Date(2026, 9, 29, 15), end: new Date(2026, 9, 29, 16, 30), allDay: false });

  it('sets the day and keeps the length when only a start is given', () => {
    expect(applyDateHint(form, { title: 'x', day: day(30), start: [19, 0] })).toEqual({
      allDay: false,
      startDate: '2026-10-30',
      startTime: '19:00',
      endDate: '2026-10-30',
      endTime: '20:30',
    });
  });

  it('moves only the day without a time, and runs past midnight when it must', () => {
    expect(applyDateHint(form, { title: 'x', day: day(2, 10) })).toMatchObject({ startDate: '2026-11-02', startTime: '15:00', endDate: '2026-11-02' });
    expect(applyDateHint(form, { title: 'x', start: [22, 0], end: [1, 0] })).toMatchObject({ startDate: '2026-10-29', endDate: '2026-10-30', endTime: '01:00' });
  });
});
