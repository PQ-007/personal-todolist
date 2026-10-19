import { describe, expect, it } from 'vitest';
import { createDemoStore, type KV } from '../src/data/demo/demoStore';
import { addDays, mondayOf } from '../src/domain/dates';

const memKV = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

describe('demo store', () => {
  it('seeds the current week and persists changes', async () => {
    const kv = memKV();
    const s = createDemoStore(kv);
    const mon = mondayOf(new Date());
    const week = await s.list(mon, addDays(mon, 7));
    expect(week.length).toBe(13);
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
    expect((await s.list(mon, addDays(mon, 7))).length).toBe(13);
  });
});
