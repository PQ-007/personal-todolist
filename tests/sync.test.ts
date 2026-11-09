import { describe, expect, it } from 'vitest';
import type { Task } from '../src/domain/types';
import type { SyncState } from '../src/state/sync';
import { TaskIds } from '../src/state/sync/ids';
import { Inflight } from '../src/state/sync/inflight';
import { SaveQueue } from '../src/state/sync/saveQueue';

const task = (id: string, title = id): Task => ({
  id,
  title,
  description: '',
  start: new Date(2026, 10, 9, 9),
  end: new Date(2026, 10, 9, 10),
  allDay: false,
  colorId: '',
  done: false,
});
const all = () => true;
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('task ids', () => {
  it('follows a temporary id to the real one, and back to its queue key', () => {
    const ids = new TaskIds();
    const tmp = ids.temp();
    expect(tmp).toMatch(/^tmp-/);
    expect(ids.real(tmp)).toBe(tmp);
    ids.link(tmp, 'real1');
    expect(ids.real(tmp)).toBe('real1');
    expect(ids.keyOf('real1')).toBe(tmp);
    expect(ids.keyOf('other')).toBe('other');
  });
});

describe('save queue', () => {
  const status = () => {
    let sync: SyncState = '';
    return { sync: () => sync, setSync: (s: SyncState) => void (sync = s) };
  };

  it('runs saves to one task in order and tells which is the latest', async () => {
    const s = status();
    const q = new SaveQueue(s);
    const order: number[] = [];
    let release!: () => void;
    const first = q.run('a', () => new Promise<number>((r) => (release = () => r(order.push(1)))));
    const second = q.run('a', async () => order.push(2));
    expect(s.sync()).toBe('saving');
    await tick();
    release();
    expect((await first).latest).toBe(false);
    expect((await second).latest).toBe(true);
    expect(order).toEqual([1, 2]);
    expect(s.sync()).toBe('saved');
  });

  it("doesn't say saved while another save is still going, or after a failed one", async () => {
    const s = status();
    const q = new SaveQueue(s);
    q.begin();
    await q.run('a', async () => 1);
    expect(s.sync()).toBe('saving');
    q.end(true);
    expect(s.sync()).toBe('saving');
  });

  it('makes saves to a task wait for another job', async () => {
    const q = new SaveQueue(status());
    const events: string[] = [];
    let release!: () => void;
    q.after('a', new Promise<void>((r) => (release = r)).then(() => void events.push('series saved')));
    const saved = q.run('a', async () => void events.push('task saved'));
    await tick();
    expect(events).toEqual([]);
    release();
    await saved;
    expect(events).toEqual(['series saved', 'task saved']);
  });
});

describe('changes being sent', () => {
  it('shows a change in place of what a reload brings, and lets go once a later load has it', () => {
    let seq = 1;
    const inflight = new Inflight(new TaskIds(), () => seq);
    const settle = inflight.expect('a', task('a', 'Edited'));
    expect(inflight.overlay([task('a', 'Old'), task('b')], all).map((t) => t.title)).toEqual(['Edited', 'b']);
    settle({ task: task('a', 'Saved') });
    // A load that started before the save may not have it yet.
    inflight.loaded(1);
    expect(inflight.overlay([task('a', 'Old')], all)[0]!.title).toBe('Saved');
    seq = 2;
    inflight.loaded(2);
    expect(inflight.overlay([task('a', 'Old')], all)[0]!.title).toBe('Old');
  });

  it('keeps a deleted task off screen, and forgets a change that failed', () => {
    const inflight = new Inflight(new TaskIds(), () => 0);
    inflight.expect('a', null);
    expect(inflight.overlay([task('a')], all)).toEqual([]);
    const settle = inflight.expect('b', task('b', 'New'));
    settle();
    expect(inflight.overlay([task('b', 'Old')], all)[0]!.title).toBe('Old');
  });

  it('lets a newer change to the same task win', () => {
    const inflight = new Inflight(new TaskIds(), () => 0);
    const first = inflight.expect('a', task('a', 'One'));
    inflight.expect('a', task('a', 'Two'));
    first();
    expect(inflight.overlay([task('a', 'Old')], all)[0]!.title).toBe('Two');
  });
});
