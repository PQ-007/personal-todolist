import { describe, expect, it } from 'vitest';
import { formFromTask, isMultiDay, rangeFromForm, setAllDay, setStartDate, validateRange } from '../src/domain/when';

describe('when form', () => {
  it('round-trips a timed single-day task', () => {
    const t = { allDay: false, start: new Date(2026, 9, 19, 9, 30), end: new Date(2026, 9, 19, 11) };
    const f = formFromTask(t);
    expect(f).toEqual({ allDay: false, startDate: '2026-10-19', startTime: '09:30', endDate: '2026-10-19', endTime: '11:00' });
    expect(rangeFromForm(f)).toEqual(t);
    expect(isMultiDay(f)).toBe(false);
  });

  it('keeps a multi-day timed task intact', () => {
    const t = { allDay: false, start: new Date(2026, 9, 19, 22), end: new Date(2026, 9, 21, 2) };
    const f = formFromTask(t);
    expect(isMultiDay(f)).toBe(true);
    expect(rangeFromForm(f)).toEqual(t);
  });

  it('moves the end date with the start date', () => {
    const f = formFromTask({ allDay: false, start: new Date(2026, 9, 19, 22), end: new Date(2026, 9, 21, 2) });
    const g = setStartDate(f, '2026-10-24');
    expect(g.endDate).toBe('2026-10-26');
    expect(rangeFromForm(g)).toEqual({ allDay: false, start: new Date(2026, 9, 24, 22), end: new Date(2026, 9, 26, 2) });
  });

  it('shows an inclusive end date for all-day tasks', () => {
    const f = formFromTask({ allDay: true, start: new Date(2026, 9, 23), end: new Date(2026, 9, 25) });
    expect(f.endDate).toBe('2026-10-24');
    expect(rangeFromForm(f)).toEqual({ allDay: true, start: new Date(2026, 9, 23), end: new Date(2026, 9, 25) });
  });

  it('toggling all-day gives one day, like the prototype', () => {
    const f = formFromTask({ allDay: false, start: new Date(2026, 9, 19, 9), end: new Date(2026, 9, 19, 10) });
    expect(rangeFromForm(setAllDay(f, true))).toEqual({ allDay: true, start: new Date(2026, 9, 19), end: new Date(2026, 9, 20) });
    const back = setAllDay(setAllDay(f, true), false);
    expect(rangeFromForm(back)).toEqual({ allDay: false, start: new Date(2026, 9, 19, 9), end: new Date(2026, 9, 19, 10) });
  });

  it('validates ranges', () => {
    expect(validateRange({ allDay: false, start: new Date(2026, 9, 19, 10), end: new Date(2026, 9, 19, 9) })).toBe('err.endBeforeStart');
    expect(validateRange({ allDay: false, start: new Date(2026, 9, 19, 23), end: new Date(2026, 9, 20, 1) })).toBeNull();
    expect(validateRange({ allDay: false, start: new Date(NaN), end: new Date() })).toBe('err.badDate');
  });

  it('never lets an all-day end precede its start', () => {
    const f = { allDay: true, startDate: '2026-10-23', startTime: '', endDate: '2026-10-20', endTime: '' };
    expect(rangeFromForm(f)).toEqual({ allDay: true, start: new Date(2026, 9, 23), end: new Date(2026, 9, 24) });
  });
});
