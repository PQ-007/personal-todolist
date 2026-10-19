import { describe, expect, it } from 'vitest';
import { daySegments, layoutDay } from '../src/domain/layout';

const seg = (id: string, sm: number, em: number) => ({ id, sm, em });
const cols = (r: ReturnType<typeof layoutDay<ReturnType<typeof seg>>>) =>
  Object.fromEntries(r.map((x) => [x.id, [x.col, x.cols]]));

describe('layoutDay', () => {
  it('gives non-overlapping events the full width', () => {
    expect(cols(layoutDay([seg('a', 0, 60), seg('b', 60, 120)]))).toEqual({ a: [0, 1], b: [0, 1] });
  });

  it('places overlapping events side by side', () => {
    expect(cols(layoutDay([seg('a', 600, 660), seg('b', 630, 690)]))).toEqual({ a: [0, 2], b: [1, 2] });
  });

  it('reuses a freed column within a cluster', () => {
    // a spans the cluster; b and c don't overlap each other, so c reuses b's column.
    expect(cols(layoutDay([seg('a', 0, 180), seg('b', 0, 60), seg('c', 60, 120)]))).toEqual({
      a: [0, 2],
      b: [1, 2],
      c: [1, 2],
    });
  });

  it('starts a new cluster after a gap', () => {
    const r = cols(layoutDay([seg('a', 0, 60), seg('b', 30, 90), seg('c', 120, 150)]));
    expect(r.c).toEqual([0, 1]);
    expect(r.a![1]).toBe(2);
  });

  it('orders longer events first when starts tie', () => {
    expect(cols(layoutDay([seg('short', 0, 30), seg('long', 0, 120)]))).toEqual({ long: [0, 2], short: [1, 2] });
  });
});

describe('daySegments', () => {
  const day = new Date(2026, 9, 19);
  const t = (s: Date, e: Date, allDay = false) => ({ start: s, end: e, allDay });

  it('clips multi-day timed events at midnight and flags the ends', () => {
    const ev = t(new Date(2026, 9, 18, 22), new Date(2026, 9, 20, 2));
    const [s] = daySegments([ev], day);
    expect(s).toMatchObject({ sm: 0, em: 1440, startsHere: false, endsHere: false });
    const [last] = daySegments([ev], new Date(2026, 9, 20));
    expect(last).toMatchObject({ sm: 0, em: 120, startsHere: false, endsHere: true });
  });

  it('skips all-day and other-day events', () => {
    expect(daySegments([t(day, new Date(2026, 9, 20), true), t(new Date(2026, 9, 18, 9), new Date(2026, 9, 18, 10))], day)).toEqual([]);
  });

  it('treats an event ending exactly at midnight as ending that day', () => {
    const [s] = daySegments([t(new Date(2026, 9, 19, 23), new Date(2026, 9, 20))], day);
    expect(s).toMatchObject({ sm: 1380, em: 1440, startsHere: true, endsHere: true });
  });
});
