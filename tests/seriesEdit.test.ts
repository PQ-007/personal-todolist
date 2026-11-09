import { describe, expect, it } from 'vitest';
import { hm, ymd } from '../src/domain/dates';
import type { Task } from '../src/domain/types';
import { contentOnly, editSeries, plainTask, splitSeries, type SeriesEdit } from '../src/state/sync/seriesEdit';

const series: Task = {
  id: 'gym',
  title: 'Gym',
  description: '',
  start: new Date(2026, 9, 5, 9, 0), // Mon 5 Oct
  end: new Date(2026, 9, 5, 10, 0),
  allDay: false,
  colorId: '',
  done: false,
  recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE'],
};
/** The occurrence on Wed 14 Oct. */
const occ: Task = { ...series, id: 'gym_x', recurrence: undefined, seriesId: 'gym', start: new Date(2026, 9, 14, 9, 0), end: new Date(2026, 9, 14, 10, 0), originalStart: new Date(2026, 9, 14, 9, 0) };
const keepRule = (change: Partial<Task>): SeriesEdit => (s) => ({ next: { ...occ, ...change }, recurrence: s.recurrence });

describe('editing all occurrences', () => {
  it('moves the series by as many days as the occurrence moved, with its new time', () => {
    const moved = editSeries(series, occ, keepRule({ start: new Date(2026, 9, 15, 18, 0), end: new Date(2026, 9, 15, 19, 30) })).series!;
    expect(`${ymd(moved.start)} ${hm(moved.start)}-${hm(moved.end)}`).toBe('2026-10-06 18:00-19:30');
    expect(moved.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=TU,TH']);
    expect(moved.id).toBe('gym');
  });

  it('stops repeating without a rule, leaving the edit as a single task', () => {
    const { series: s, next } = editSeries(series, occ, () => ({ next: { ...occ, title: 'Once' }, recurrence: undefined }));
    expect(s).toBeNull();
    expect(plainTask(next)).toMatchObject({ title: 'Once', recurrence: undefined, seriesId: undefined, originalStart: undefined });
  });

  it('tells content-only edits from ones that move or change the rule', () => {
    expect(contentOnly(series, editSeries(series, occ, keepRule({ title: 'Lift' })).series!)).toBe(true);
    expect(contentOnly(series, editSeries(series, occ, keepRule({ start: new Date(2026, 9, 14, 8, 0) })).series!)).toBe(false);
    const daily = editSeries(series, occ, () => ({ next: occ, recurrence: ['RRULE:FREQ=DAILY'] })).series!;
    expect(contentOnly(series, daily)).toBe(false);
  });
});

describe('editing this and following', () => {
  it('ends the series the day before and starts a new one there', () => {
    const { before, rest } = splitSeries(series, occ, keepRule({ title: 'Lift' }));
    expect(before).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=' + new Date(2026, 9, 13, 23, 59, 59).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')]);
    expect(rest).toMatchObject({ title: 'Lift', done: false, seriesId: undefined, recurrence: series.recurrence });
  });
});
