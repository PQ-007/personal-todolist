import { describe, expect, it } from 'vitest';
import { ymd } from '../src/domain/dates';
import { addMonths, monthGrid, stepDay, visibleRange } from '../src/domain/views';

const wed = new Date(2026, 9, 21); // Wednesday, Oct 21 2026

describe('views', () => {
  it('computes the visible days for each view', () => {
    const r = (view: 'day' | 'workweek' | 'week' | 'month', span = 1) => {
      const x = visibleRange({ view, day: wed, span });
      return [ymd(x.from), x.days];
    };
    expect(r('day')).toEqual(['2026-10-21', 1]);
    expect(r('day', 3)).toEqual(['2026-10-21', 3]);
    expect(r('workweek')).toEqual(['2026-10-19', 5]);
    expect(r('week')).toEqual(['2026-10-19', 7]);
    expect(r('month')).toEqual(['2026-09-28', 35]);
  });

  it('covers months that need six rows', () => {
    // August 2026 starts on a Saturday and ends on a Monday.
    expect(monthGrid(new Date(2026, 7, 15))).toMatchObject({ days: 42 });
    expect(ymd(monthGrid(new Date(2026, 7, 15)).from)).toBe('2026-07-27');
  });

  it('steps by the size of the view', () => {
    expect(ymd(stepDay({ view: 'day', day: wed, span: 3 }, 1))).toBe('2026-10-24');
    expect(ymd(stepDay({ view: 'week', day: wed, span: 1 }, -1))).toBe('2026-10-14');
    expect(ymd(stepDay({ view: 'month', day: wed, span: 1 }, 1))).toBe('2026-11-21');
  });

  it('clamps month steps to the last day of the month', () => {
    expect(ymd(addMonths(new Date(2026, 0, 31), 1))).toBe('2026-02-28');
    expect(ymd(addMonths(new Date(2026, 2, 31), -1))).toBe('2026-02-28');
  });
});
