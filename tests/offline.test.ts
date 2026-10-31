import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOutbox, createTaskCache, queueChange, type Pending } from '../src/data/offline';
import type { Task } from '../src/domain/types';

const task = (id: string, title = 'A', day = 26): Task => ({
  id,
  title,
  description: '',
  start: new Date(2026, 9, day, 10),
  end: new Date(2026, 9, day, 11),
  allDay: false,
  colorId: '9',
  done: false,
});

describe('outbox', () => {
  it('keeps one change per task, from the first known version to the latest', () => {
    let list: Pending[] = [];
    list = queueChange(list, { key: 'a', base: task('a'), next: task('a', 'B') });
    list = queueChange(list, { key: 'a', base: task('a', 'B'), next: task('a', 'C') });
    expect(list).toEqual([{ key: 'a', base: task('a'), next: task('a', 'C') }]);
    // Deleting it later keeps the base, so the delete can be sent.
    list = queueChange(list, { key: 'a', base: null, next: null });
    expect(list).toEqual([{ key: 'a', base: task('a'), next: null }]);
  });

  it('drops a task created and deleted while offline', () => {
    let list = queueChange([], { key: 'tmp-1', base: null, next: task('tmp-1') });
    list = queueChange(list, { key: 'tmp-1', base: null, next: task('tmp-1', 'Renamed') });
    expect(list).toHaveLength(1);
    expect(queueChange(list, { key: 'tmp-1', base: null, next: null })).toEqual([]);
  });

  it('survives a reload, dates included', () => {
    const box = createOutbox('cal', localStorage);
    box.save([{ key: 'tmp-1', base: null, next: task('tmp-1') }]);
    const [p] = createOutbox('cal', localStorage).load();
    expect(p!.next!.start).toEqual(new Date(2026, 9, 26, 10));
    box.save([]);
    expect(localStorage.getItem('planner_outbox_cal')).toBeNull();
  });
});

describe('task cache', () => {
  it('serves a range from the same range or one that contains it', () => {
    const cache = createTaskCache('cal', localStorage);
    const monday = new Date(2026, 9, 26);
    cache.put(monday, 7, [task('a', 'A', 26), task('b', 'B', 30)]);
    expect(cache.get(monday, 7)!.map((t) => t.id)).toEqual(['a', 'b']);
    expect(cache.get(new Date(2026, 9, 30), 1)!.map((t) => t.id)).toEqual(['b']);
    expect(cache.get(new Date(2026, 10, 2), 7)).toBeNull();
  });
});

/* ---------- the planner, end to end with a fake Google ---------- */

const now = new Date();
const at = (h: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h).toISOString();
const event = { id: 'e1', etag: '"1"', summary: 'Standup', start: { dateTime: at(10) }, end: { dateTime: at(11) } };

interface Call {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}

function fakeGoogle() {
  const net = { up: true, calls: [] as Call[] };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if (!net.up) throw new TypeError('Failed to fetch');
      const method = init.method ?? 'GET';
      const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null;
      net.calls.push({ method, url, body });
      if (method === 'GET') return new Response(JSON.stringify({ items: [event] }));
      if (method === 'POST') return new Response(JSON.stringify({ ...body, id: 'new1', etag: '"1"' }));
      return new Response(JSON.stringify({ ...event, ...body, etag: '"2"' }));
    }),
  );
  return net;
}

async function freshPlanner() {
  vi.resetModules();
  const { Planner } = await import('../src/state/planner');
  return new Planner();
}

describe('planner offline', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    localStorage.clear();
    localStorage.setItem('planner_cfg', JSON.stringify({ mode: 'google', clientId: 'x', calendarId: 'primary' }));
    localStorage.setItem('planner_view', JSON.stringify({ view: 'day', span: 1 }));
    sessionStorage.setItem('planner_tok', JSON.stringify({ tok: 'tok', exp: Date.now() + 600_000 }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps changes made offline, across a reload, and sends them once back online', async () => {
    const net = fakeGoogle();
    let p = await freshPlanner();
    await p.refresh();
    expect(p.get().tasks.map((t) => t.title)).toEqual(['Standup']);

    net.up = false;
    await p.patch('e1', { title: 'Standup (moved)' });
    await p.create({ title: 'Buy milk', description: '', colorId: '9', done: false, allDay: false, start: new Date(at(15)), end: new Date(at(16)) });
    expect(p.get().sync).toBe('offline');
    expect(p.get().unsent).toBe(2);
    expect(p.get().tasks.map((t) => t.title).sort()).toEqual(['Buy milk', 'Standup (moved)']);

    // Reopened while still offline: the last loaded day, with the changes on top.
    p = await freshPlanner();
    await p.refresh();
    expect(p.get().unsent).toBe(2);
    expect(p.get().tasks.map((t) => t.title).sort()).toEqual(['Buy milk', 'Standup (moved)']);

    net.up = true;
    net.calls.length = 0;
    await p.refresh();
    await vi.waitFor(() => expect(p.get().unsent).toBe(0));
    const writes = net.calls.filter((c) => c.method !== 'GET');
    expect(writes.map((c) => c.method)).toEqual(['PATCH', 'POST']);
    expect(writes[0]!.body).toEqual({ summary: 'Standup (moved)' });
    expect(writes[1]!.body).toMatchObject({ summary: 'Buy milk' });
    expect(localStorage.getItem('planner_outbox_primary')).toBeNull();
  });

  it('never sends a task created and deleted while offline', async () => {
    const net = fakeGoogle();
    const p = await freshPlanner();
    await p.refresh();
    net.up = false;
    await p.create({ title: 'Oops', description: '', colorId: '9', done: false, allDay: false, start: new Date(at(15)), end: new Date(at(16)) });
    const tmp = p.get().tasks.find((t) => t.title === 'Oops')!;
    await p.remove(tmp.id);
    expect(p.get().unsent).toBe(0);
    net.up = true;
    net.calls.length = 0;
    await p.refresh();
    expect(net.calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });
});
