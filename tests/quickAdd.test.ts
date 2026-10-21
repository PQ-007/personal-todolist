import { describe, expect, it } from 'vitest';
import { hm } from '../src/domain/dates';
import { parseQuickAdd } from '../src/domain/quickAdd';

const day = new Date(2026, 9, 20);

describe('parseQuickAdd', () => {
  it('ignores blank input', () => {
    expect(parseQuickAdd('   ', day)).toBeNull();
  });

  it('makes plain text an all-day task', () => {
    const t = parseQuickAdd('Call the bank', day)!;
    expect(t).toMatchObject({ title: 'Call the bank', allDay: true });
  });

  it('reads a leading start time as a one-hour task', () => {
    const t = parseQuickAdd('14:00 Review PR', day)!;
    expect(t.allDay).toBe(false);
    expect([hm(t.start), hm(t.end), t.title]).toEqual(['14:00', '15:00', 'Review PR']);
  });

  it('reads a leading time range', () => {
    const t = parseQuickAdd('9:30-11:00 Planning', day)!;
    expect([hm(t.start), hm(t.end), t.title]).toEqual(['09:30', '11:00', 'Planning']);
  });

  it('keeps invalid times as part of the title', () => {
    expect(parseQuickAdd('25:00 Late', day)).toMatchObject({ title: '25:00 Late', allDay: true });
    expect(parseQuickAdd('11:00-10:00 Backwards', day)).toMatchObject({ allDay: true });
  });
});
