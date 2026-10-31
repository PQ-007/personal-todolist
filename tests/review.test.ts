import { describe, expect, it } from 'vitest';
import { streaks, weekReview } from '../src/domain/review';
import type { Task } from '../src/domain/types';

let seq = 0;
const task = (d: number, done: boolean, extra: Partial<Task> = {}): Task => ({
  id: `t${++seq}`,
  title: 'T',
  description: '',
  start: new Date(2026, 9, d, 8),
  end: new Date(2026, 9, d, 9),
  allDay: false,
  colorId: '9',
  done,
  ...extra,
});

describe('weekReview', () => {
  it('counts each task on its start day, by day and by label', () => {
    const r = weekReview([task(26, true, { label: 'work' }), task(26, false, { label: 'work' }), task(28, true), task(2, true)], new Date(2026, 9, 26));
    expect(r).toMatchObject({ done: 2, total: 3 });
    expect(r.days.map((d) => d.total)).toEqual([2, 0, 1, 0, 0, 0, 0]);
    expect(r.byLabel).toEqual([
      { label: 'work', done: 1, total: 2 },
      { label: null, done: 1, total: 1 },
    ]);
  });
});

describe('streaks', () => {
  const wake = (d: number, done: boolean) => task(d, done, { seriesId: 'wake', title: 'Wake up' });
  const now = new Date(2026, 9, 29, 7);

  it('counts the current and best runs', () => {
    const s = streaks([wake(20, true), wake(21, true), wake(22, true), wake(23, false), wake(24, true), wake(25, true), wake(26, true), wake(27, true), wake(28, true)], now);
    expect(s).toEqual([{ seriesId: 'wake', title: 'Wake up', colorId: '9', current: 5, best: 5 }]);
  });

  it("doesn't break the run on today's open occurrence, and ignores future ones", () => {
    const tasks = [wake(27, true), wake(28, true), { ...wake(29, false), start: new Date(2026, 9, 29, 6) }, wake(30, false)];
    expect(streaks(tasks, now)[0]).toMatchObject({ current: 2, best: 2 });
  });

  it('leaves out series never done and plain tasks', () => {
    expect(streaks([wake(27, false), task(28, true)], now)).toEqual([]);
  });
});
