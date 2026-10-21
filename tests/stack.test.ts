import { describe, expect, it } from 'vitest';
import { hm, ymd } from '../src/domain/dates';
import { itemFromTask, nextFreeSlot, parseStackInput, taskFromItem, type StackItem } from '../src/domain/stack';
import type { Task } from '../src/domain/types';

const day = new Date(2026, 9, 22);
const early = new Date(2026, 9, 22, 6, 0);
const at = (h1: number, m1: number, h2: number, m2: number, over: Partial<Task> = {}): Task => ({
  id: `t${h1}${m1}`,
  title: 'busy',
  description: '',
  colorId: '9',
  done: false,
  allDay: false,
  start: new Date(2026, 9, 22, h1, m1),
  end: new Date(2026, 9, 22, h2, m2),
  ...over,
});

describe('parseStackInput', () => {
  it('reads an optional length at the end', () => {
    expect(parseStackInput('Write report 1.5h')).toEqual({ title: 'Write report', minutes: 90, tags: [] });
    expect(parseStackInput('Call the bank 15m')).toEqual({ title: 'Call the bank', minutes: 15, tags: [] });
    expect(parseStackInput('Gym 45 min')).toEqual({ title: 'Gym', minutes: 45, tags: [] });
    expect(parseStackInput('報告書を書く')).toEqual({ title: '報告書を書く', minutes: 30, tags: [] });
    expect(parseStackInput('   ')).toBeNull();
  });

  it('pulls #tags out before reading the length', () => {
    expect(parseStackInput('Write #urgent report #q4 1h')).toEqual({ title: 'Write report', minutes: 60, tags: ['urgent', 'q4'] });
    expect(parseStackInput('#only')).toBeNull();
  });

  it('keeps a number that is only a title', () => {
    expect(parseStackInput('1h')).toEqual({ title: '1h', minutes: 30, tags: [] });
    expect(parseStackInput('Room 2m')).toEqual({ title: 'Room 2m', minutes: 30, tags: [] });
  });
});

describe('nextFreeSlot', () => {
  it('starts at 09:00 on an empty day', () => {
    expect(hm(nextFreeSlot([], day, 30, early))).toBe('09:00');
  });

  it('never starts in the past', () => {
    expect(hm(nextFreeSlot([], day, 30, new Date(2026, 9, 22, 10, 7)))).toBe('10:15');
  });

  it('finds the first gap that is long enough', () => {
    const tasks = [at(10, 30, 12, 0), at(9, 0, 10, 0), at(13, 0, 14, 0, { allDay: true })];
    expect(hm(nextFreeSlot(tasks, day, 30, early))).toBe('10:00');
    expect(hm(nextFreeSlot(tasks, day, 60, early))).toBe('12:00');
  });

  it('goes after the last task when the day is full', () => {
    const tasks = [at(9, 0, 18, 10)];
    expect(hm(nextFreeSlot(tasks, day, 30, early))).toBe('18:15');
  });
});

describe('moving between stack and calendar', () => {
  const item: StackItem = { id: 's1', title: 'Report', description: '- [ ] a', colorId: '3', label: 'work', minutes: 45 };

  it('schedules an item with its length', () => {
    const t = taskFromItem(item, new Date(2026, 9, 22, 14, 0));
    expect([hm(t.start), hm(t.end), t.allDay, t.label, t.done]).toEqual(['14:00', '14:45', false, 'work', false]);
    const allDay = taskFromItem(item, new Date(2026, 9, 22, 14, 0), true);
    expect([ymd(allDay.start), ymd(allDay.end), allDay.allDay]).toEqual(['2026-10-22', '2026-10-23', true]);
  });

  it('keeps a timed task’s length when it goes back to the stack', () => {
    expect(itemFromTask(at(9, 0, 10, 30, { title: 'Back' }), 'x')).toMatchObject({ title: 'Back', minutes: 90 });
  });
});
