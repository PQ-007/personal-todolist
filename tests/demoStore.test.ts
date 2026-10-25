import { describe, expect, it } from 'vitest';
import { createDemoStore, type KV } from '../src/data/demo/demoStore';
import { seedWeek } from '../src/data/demo/seed';
import { occurrences, parseRule } from '../src/domain/recurrence';
import { addDays, mondayOf } from '../src/domain/dates';

const memKV = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

/** Sample tasks the current week shows: plain ones overlapping it, plus each occurrence of a series. */
const inThisWeek = () => {
  const mon = mondayOf(new Date());
  const end = addDays(mon, 7);
  return seedWeek().reduce((n, t) => {
    const rule = parseRule(t.recurrence);
    if (rule) return n + occurrences(rule, t.start, t.end.getTime() - t.start.getTime(), mon, end).length;
    return n + (t.start < end && t.end > mon ? 1 : 0);
  }, 0);
};

describe('demo store', () => {
  it('seeds the current week and persists changes', async () => {
    const kv = memKV();
    const s = createDemoStore(kv);
    const mon = mondayOf(new Date());
    const week = await s.list(mon, addDays(mon, 7));
    expect(week.length).toBe(inThisWeek());
    const first = week[0]!;
    await s.update(first, { ...first, done: true });
    const created = await s.create({ ...first, title: 'New' });
    await s.remove(week[1]!.id);

    const again = await createDemoStore(kv).list(mon, addDays(mon, 7));
    expect(again.find((t) => t.id === first.id)?.done).toBe(true);
    expect(again.find((t) => t.id === created.id)?.title).toBe('New');
    expect(again.find((t) => t.id === week[1]!.id)).toBeUndefined();
    expect(again[0]!.start).toBeInstanceOf(Date);
  });

  it('reset restores the sample week', async () => {
    const kv = memKV();
    const s = createDemoStore(kv);
    const mon = mondayOf(new Date());
    const [a] = await s.list(mon, addDays(mon, 7));
    await s.remove(a!.id);
    s.reset();
    expect((await s.list(mon, addDays(mon, 7))).length).toBe(inThisWeek());
  });
});

describe('repeating tasks in the demo store', () => {
  const mon = new Date(2026, 9, 19);
  const week = (s: ReturnType<typeof createDemoStore>) => s.list(mon, addDays(mon, 7)).then((ts) => ts.filter((t) => t.title === 'Run'));
  const fresh = async () => {
    const s = createDemoStore(memKV());
    await s.list(mon, addDays(mon, 1)); // seed, then add our own series
    const series = await s.create({
      title: 'Run',
      description: '',
      colorId: '9',
      done: false,
      allDay: false,
      start: new Date(2026, 9, 19, 7),
      end: new Date(2026, 9, 19, 8),
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'],
    });
    return { s, series };
  };

  it('lists each occurrence with its series id', async () => {
    const { s, series } = await fresh();
    const runs = await week(s);
    expect(runs.map((t) => t.start.getDate())).toEqual([19, 21, 23]);
    expect(runs.every((t) => t.seriesId === series.id && !t.recurrence)).toBe(true);
    expect((await s.getSeries(series.id)).recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR']);
  });

  it('changes or deletes one occurrence without touching the others', async () => {
    const { s } = await fresh();
    const [mo, we] = await week(s);
    await s.update(mo!, { ...mo!, done: true, start: new Date(2026, 9, 19, 9), end: new Date(2026, 9, 19, 10) });
    await s.remove(we!.id);
    const runs = await week(s);
    expect(runs.map((t) => [t.start.getDate(), t.start.getHours(), t.done])).toEqual([
      [23, 7, false],
      [19, 9, true],
    ]);
  });

  it('deleting the series removes every occurrence', async () => {
    const { s, series } = await fresh();
    const [mo] = await week(s);
    await s.update(mo!, { ...mo!, done: true });
    await s.remove(series.id);
    expect(await week(s)).toEqual([]);
  });
});
