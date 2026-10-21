import { describe, expect, it } from 'vitest';
import { copyOf, placeCopy, weekCopies } from '../src/domain/clipboard';
import { hm, ymd } from '../src/domain/dates';
import type { Task } from '../src/domain/types';

const task = (over: Partial<Task>): Task => ({
  id: 'a',
  etag: 'e',
  title: 'Review',
  description: '- [x] done item',
  colorId: '3',
  done: true,
  allDay: false,
  start: new Date(2026, 9, 20, 9, 30),
  end: new Date(2026, 9, 20, 11, 0),
  label: 'personal',
  extraProps: { other: 'x' },
  ...over,
});

describe('copy and paste', () => {
  it('copies content but not identity or done state', () => {
    const c = copyOf(task({}));
    expect(c).not.toHaveProperty('id');
    expect(c).not.toHaveProperty('etag');
    expect(c).not.toHaveProperty('extraProps');
    expect(c).toMatchObject({ title: 'Review', colorId: '3', label: 'personal', done: false });
  });

  it('pastes a timed task at a grid slot, keeping its length', () => {
    const p = placeCopy(copyOf(task({})), new Date(2026, 9, 22), new Date(2026, 9, 22, 14, 0));
    expect([ymd(p.start), hm(p.start), hm(p.end)]).toEqual(['2026-10-22', '14:00', '15:30']);
  });

  it('pastes a timed task onto a day at its original time', () => {
    const p = placeCopy(copyOf(task({})), new Date(2026, 9, 23));
    expect([ymd(p.start), hm(p.start), hm(p.end)]).toEqual(['2026-10-23', '09:30', '11:00']);
  });

  it('keeps all-day tasks all-day and their number of days', () => {
    const src = copyOf(task({ allDay: true, start: new Date(2026, 9, 20), end: new Date(2026, 9, 22) }));
    const p = placeCopy(src, new Date(2026, 9, 26), new Date(2026, 9, 26, 14, 0));
    expect([p.allDay, ymd(p.start), ymd(p.end)]).toEqual([true, '2026-10-26', '2026-10-28']);
  });
});

describe('weekCopies', () => {
  const mon = new Date(2026, 9, 12);
  const at = (d: number, h: number, title = 'T') =>
    task({ id: title + d + h, title, start: new Date(2026, 9, 12 + d, h), end: new Date(2026, 9, 12 + d, h + 1) });

  it('moves the source week forward by seven days as open tasks', () => {
    const [c] = weekCopies([at(1, 9)], [], mon, 7);
    expect([ymd(c!.start), hm(c!.start), hm(c!.end), c!.done]).toEqual(['2026-10-20', '09:00', '10:00', false]);
  });

  it('only takes tasks starting inside the chosen days', () => {
    const src = [at(-1, 9, 'before'), at(4, 9, 'fri'), at(5, 9, 'sat'), at(7, 9, 'next')];
    expect(weekCopies(src, [], mon, 5).map((c) => c.title)).toEqual(['fri']);
    expect(weekCopies(src, [], mon, 7).map((c) => c.title)).toEqual(['fri', 'sat']);
  });

  it('unticks checklists in the copies', () => {
    const src = [task({ description: '- [x] a\n- [ ] b\n```\n- [x] code\n```', start: new Date(2026, 9, 13, 9), end: new Date(2026, 9, 13, 10) })];
    expect(weekCopies(src, [], mon, 7)[0]!.description).toBe('- [ ] a\n- [ ] b\n```\n- [x] code\n```');
  });

  it('skips tasks that already exist in the target week', () => {
    const src = [at(0, 9, 'a'), at(0, 10, 'b')];
    const already = [task({ title: 'a', start: new Date(2026, 9, 19, 9), end: new Date(2026, 9, 19, 10) })];
    expect(weekCopies(src, already, mon, 7).map((c) => c.title)).toEqual(['b']);
  });
});
