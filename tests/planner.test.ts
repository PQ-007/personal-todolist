import { beforeEach, describe, expect, it, vi } from 'vitest';

// Signed in, as far as the planner can tell, so the Google paths (offline copy included) run.
vi.mock('../src/data/google/auth', () => ({
  authUnreachable: () => false,
  clearToken: () => {},
  ensureToken: async () => true,
  getToken: async () => 'token',
  restoreToken: () => {},
  signIn: async () => {},
  signOut: async () => {},
}));

import { OfflineError, type TaskStore } from '../src/data/store';
import { copyOf as copyOfTask } from '../src/domain/clipboard';
import { startOfDay } from '../src/domain/dates';
import type { NewTask, Task } from '../src/domain/types';
import { Planner } from '../src/state/planner';

/**
 * Like Google: a write takes `writeMs` to land, and a read sees the data as it was when sent,
 * answering `readMs` later.
 */
function laggy(store: TaskStore, writeMs: number, readMs: number): TaskStore {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return new Proxy(store, {
    get(target, key) {
      const v = (target as unknown as Record<PropertyKey, unknown>)[key];
      if (typeof v !== 'function') return v;
      if (key === 'list') return async (...a: unknown[]) => { const r = await v.apply(target, a); await wait(readMs); return r; };
      return async (...a: unknown[]) => { await wait(writeMs); return v.apply(target, a); };
    },
  });
}

/** Every call fails as if there were no connection. */
const unreachable = (store: TaskStore): TaskStore =>
  new Proxy(store, {
    get: (target, key) =>
      typeof (target as unknown as Record<PropertyKey, unknown>)[key] === 'function'
        ? async () => { throw new OfflineError(); }
        : (target as unknown as Record<PropertyKey, unknown>)[key],
  });

/** A planner on the demo calendar, treated as Google (see the mock above). */
async function planner(): Promise<{ p: Planner; inner: { store: TaskStore } }> {
  localStorage.clear();
  const p = new Planner();
  const inner = p as unknown as { store: TaskStore; state: { settings: { mode: string } }; loadOffline(): void };
  inner.state.settings = { ...inner.state.settings, mode: 'google' };
  inner.loadOffline();
  await p.refresh();
  return { p, inner };
}

const task = (p: Planner, title: string, extra: Partial<NewTask> = {}): NewTask => {
  const d = startOfDay(p.get().day);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9);
  return { title, description: '', colorId: '', done: false, allDay: false, start, end: new Date(start.getTime() + 36e5), ...extra };
};
const titled = (p: Planner, title: string) => p.get().tasks.filter((t) => t.title === title);

beforeEach(() => localStorage.clear());

describe('changes stay on screen while they are sent', () => {
  it('keeps a new task through a reload that overlaps its save', async () => {
    const { p, inner } = await planner();
    inner.store = laggy(inner.store, 300, 500);
    const created = p.create(task(p, 'New'));
    const reload = p.refresh();
    await created;
    await reload;
    expect(titled(p, 'New')).toHaveLength(1);
    expect(titled(p, 'New')[0]!.id).not.toMatch(/^tmp-/);
  });

  it('keeps an edit through a reload while it is being saved', async () => {
    const { p, inner } = await planner();
    const t = p.get().tasks[0]!;
    inner.store = laggy(inner.store, 300, 100);
    const saved = p.update({ ...t, title: 'Edited' });
    await p.refresh();
    expect(titled(p, 'Edited')).toHaveLength(1);
    await saved;
    expect(titled(p, 'Edited')).toHaveLength(1);
  });

  it('keeps a deleted task hidden through a reload', async () => {
    const { p, inner } = await planner();
    const t = p.get().tasks[0]!;
    inner.store = laggy(inner.store, 300, 100);
    const removed = p.remove(t.id);
    await p.refresh();
    expect(p.find(t.id)).toBeUndefined();
    await removed;
  });
});

describe('repeating tasks', () => {
  it('shows a change to every occurrence before it is saved', async () => {
    const { p, inner } = await planner();
    await p.create(task(p, 'Daily', { recurrence: ['RRULE:FREQ=DAILY'] }));
    const days = p.get().range.days;
    expect(titled(p, 'Daily')).toHaveLength(days);
    inner.store = laggy(inner.store, 300, 100);
    const occ = titled(p, 'Daily')[0]!;
    const job = p.updateSeries(occ, (s) => ({ next: { ...occ, title: 'Renamed' }, recurrence: s.recurrence }));
    await Promise.resolve();
    expect(titled(p, 'Renamed')).toHaveLength(days);
    await job;
    expect(titled(p, 'Renamed')).toHaveLength(days);
  });

  it('refuses to change a series offline instead of losing the change', async () => {
    const { p, inner } = await planner();
    await p.create(task(p, 'Daily', { recurrence: ['RRULE:FREQ=DAILY'] }));
    const occ = titled(p, 'Daily')[0]!;
    inner.store = unreachable(inner.store);
    await p.refresh(); // finds out it's offline
    await p.deleteSeries(occ);
    expect(titled(p, 'Daily').length).toBeGreaterThan(0);
    expect(p.get().toast?.msg).toMatch(/connection/);
  });

  it('puts a series back on screen when saving it fails', async () => {
    const { p, inner } = await planner();
    await p.create(task(p, 'Daily', { recurrence: ['RRULE:FREQ=DAILY'] }));
    const occ = titled(p, 'Daily')[0]!;
    // Still counted as online: the connection drops while saving.
    inner.store = unreachable(inner.store);
    await p.deleteSeries(occ);
    expect(titled(p, 'Daily').length).toBeGreaterThan(0);
  });
});

describe('repeating tasks, without waiting', () => {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('brings deleted occurrences back at once on undo', async () => {
    const { p, inner } = await planner();
    await p.create(task(p, 'Daily', { recurrence: ['RRULE:FREQ=DAILY'] }));
    const days = p.get().range.days;
    inner.store = laggy(inner.store, 300, 100);
    const deleted = p.deleteSeries(titled(p, 'Daily')[0]!);
    expect(titled(p, 'Daily')).toHaveLength(0);
    p.get().toast!.action!.run();
    expect(titled(p, 'Daily')).toHaveLength(days);
    await deleted;
    // The undo's own save and reload.
    await (p as unknown as { seriesQueue: Promise<void> }).seriesQueue;
    expect(titled(p, 'Daily')).toHaveLength(days);
  });

  it('brings occurrences deleted from a day on back at once on undo', async () => {
    const { p, inner } = await planner();
    await p.create(task(p, 'Daily', { recurrence: ['RRULE:FREQ=DAILY'] }));
    const days = p.get().range.days;
    inner.store = laggy(inner.store, 300, 100);
    const third = [...titled(p, 'Daily')].sort((a, b) => +a.start - +b.start)[2]!;
    void p.deleteFollowing(third);
    expect(titled(p, 'Daily')).toHaveLength(2);
    p.get().toast!.action!.run();
    expect(titled(p, 'Daily')).toHaveLength(days);
    await (p as unknown as { seriesQueue: Promise<void> }).seriesQueue;
    expect(titled(p, 'Daily')).toHaveLength(days);
  });

  it('keeps an occurrence moved on its own where it is when only the text of all of them changes', async () => {
    const { p, inner } = await planner();
    await p.create(task(p, 'Daily', { recurrence: ['RRULE:FREQ=DAILY'] }));
    const second = [...titled(p, 'Daily')].sort((a, b) => +a.start - +b.start)[1]!;
    const later = new Date(second.start.getTime() + 3 * 36e5);
    await p.update({ ...second, start: later, end: new Date(later.getTime() + 36e5) });
    inner.store = laggy(inner.store, 300, 100);
    const occ = titled(p, 'Daily')[0]!;
    const job = p.updateSeries(occ, (s) => ({ next: { ...copyOfTask(s), title: 'Renamed' }, recurrence: s.recurrence }));
    await wait(0);
    const moved = p.get().tasks.find((t) => t.title === 'Renamed' && t.originalStart?.getTime() === second.originalStart!.getTime());
    expect(moved?.start.getTime()).toBe(later.getTime());
    await job;
  });

  it("doesn't say saved while a series change is still saving", async () => {
    const { p, inner } = await planner();
    await p.create(task(p, 'Daily', { recurrence: ['RRULE:FREQ=DAILY'] }));
    const other = p.get().tasks.find((t) => t.title !== 'Daily')!;
    inner.store = laggy(inner.store, 300, 100);
    const job = p.deleteSeries(titled(p, 'Daily')[0]!);
    await p.update({ ...other, title: 'Quick edit' });
    expect(p.get().sync).toBe('saving');
    await job;
  });
});

describe('copying the previous week', () => {
  it("copies from last week as last loaded, without waiting for Google", async () => {
    const { p, inner } = await planner();
    p.setView('week');
    p.step(-1);
    await p.refresh();
    await p.create(task(p, 'Last week only'));
    p.step(1);
    await p.refresh();
    inner.store = laggy(inner.store, 300, 300);
    void p.copyPreviousWeek();
    await new Promise((r) => setTimeout(r, 20));
    expect(titled(p, 'Last week only')).toHaveLength(1);
  });
});

describe('moving to other days', () => {
  it('shows days loaded before at once, before Google answers', async () => {
    const { p, inner } = await planner();
    const here: Task[] = p.get().tasks;
    expect(here.length).toBeGreaterThan(0);
    p.step(1);
    await p.refresh();
    inner.store = laggy(inner.store, 0, 300);
    p.step(-1);
    expect(p.get().tasks.map((t) => t.id).sort()).toEqual(here.map((t) => t.id).sort());
    await p.refresh();
  });

  it('shows them with the changes saved since they were loaded', async () => {
    const { p, inner } = await planner();
    const [kept, gone] = p.get().tasks;
    await p.update({ ...kept!, title: 'Edited' });
    await p.remove(gone!.id);
    await p.create(task(p, 'Added'));
    p.step(1);
    await p.refresh();
    inner.store = laggy(inner.store, 0, 300);
    p.step(-1);
    expect(p.find(kept!.id)?.title).toBe('Edited');
    expect(p.find(gone!.id)).toBeUndefined();
    expect(titled(p, 'Added')).toHaveLength(1);
    await p.refresh();
  });
});

describe('coming back to the tab', () => {
  it('shows changes made elsewhere meanwhile', async () => {
    const { p, inner } = await planner();
    await inner.store.create(task(p, 'From phone'));
    expect(titled(p, 'From phone')).toHaveLength(0);
    document.dispatchEvent(new Event('visibilitychange'));
    // The reload the event started (not one started here).
    await (p as unknown as { loading: Promise<void> }).loading;
    expect(titled(p, 'From phone')).toHaveLength(1);
  });
});
