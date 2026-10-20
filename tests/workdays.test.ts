import { describe, expect, it } from 'vitest';
import { nearestWorkday, stepWorkday, ymd } from '../src/domain/dates';

describe('workdays', () => {
  it('moves a weekend to the following Monday', () => {
    expect(ymd(nearestWorkday(new Date(2026, 9, 17)))).toBe('2026-10-19'); // Sat
    expect(ymd(nearestWorkday(new Date(2026, 9, 18)))).toBe('2026-10-19'); // Sun
    expect(ymd(nearestWorkday(new Date(2026, 9, 20)))).toBe('2026-10-20'); // Tue
  });

  it('steps over weekends in both directions', () => {
    expect(ymd(stepWorkday(new Date(2026, 9, 23), 1))).toBe('2026-10-26'); // Fri → Mon
    expect(ymd(stepWorkday(new Date(2026, 9, 26), -1))).toBe('2026-10-23'); // Mon → Fri
  });
});
