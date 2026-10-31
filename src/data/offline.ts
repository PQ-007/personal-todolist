import type { Task } from '../domain/types';
import type { KV } from './demo/demoStore';

/**
 * What lets the app keep working without a connection: the last tasks loaded for each range
 * of days (shown while offline), and the changes made while offline (sent once back online).
 * Both are kept in this browser, one set per calendar.
 */

type Stored = Omit<Task, 'start' | 'end' | 'originalStart'> & { start: string; end: string; originalStart?: string };

const toStored = ({ start, end, originalStart, ...rest }: Task): Stored => ({
  ...rest,
  start: start.toISOString(),
  end: end.toISOString(),
  ...(originalStart ? { originalStart: originalStart.toISOString() } : {}),
});
const fromStored = ({ start, end, originalStart, ...rest }: Stored): Task => ({
  ...rest,
  start: new Date(start),
  end: new Date(end),
  ...(originalStart ? { originalStart: new Date(originalStart) } : {}),
});

function read<T>(kv: KV, key: string, fallback: T): T {
  try {
    return (JSON.parse(kv.getItem(key) ?? 'null') as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}
function write(kv: KV, key: string, value: unknown) {
  try {
    kv.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable: offline copies last for this session only */
  }
}

/** Ranges kept; a few weeks plus a month or two is plenty to look around while offline. */
const MAX_RANGES = 8;

interface CachedRange {
  from: string;
  days: number;
  tasks: Stored[];
}

export interface TaskCache {
  /** The tasks last loaded for [from, from + days), or from a cached range containing it. */
  get(from: Date, days: number): Task[] | null;
  put(from: Date, days: number, tasks: Task[]): void;
}

export function createTaskCache(calendarId: string, kv: KV = localStorage): TaskCache {
  const key = `planner_cache_${calendarId}`;
  return {
    get(from, days) {
      const to = from.getTime() + days * 864e5;
      const ranges = read<CachedRange[]>(kv, key, []);
      const hit =
        ranges.find((r) => new Date(r.from).getTime() === from.getTime() && r.days === days) ??
        ranges.find((r) => new Date(r.from).getTime() <= from.getTime() && new Date(r.from).getTime() + r.days * 864e5 >= to);
      if (!hit) return null;
      return hit.tasks.map(fromStored).filter((t) => t.start.getTime() < to && t.end.getTime() > from.getTime());
    },
    put(from, days, tasks) {
      const ranges = read<CachedRange[]>(kv, key, []).filter((r) => !(new Date(r.from).getTime() === from.getTime() && r.days === days));
      write(kv, key, [{ from: from.toISOString(), days, tasks: tasks.map(toStored) }, ...ranges].slice(0, MAX_RANGES));
    },
  };
}

/**
 * A change waiting to be sent, one per task: `base` is the task as the server last had it (null
 * for a task created offline) and `next` what it should become (null once deleted). `key` is the
 * task's id when the change was made (a temporary id for new tasks).
 */
export interface Pending {
  key: string;
  base: Task | null;
  next: Task | null;
}

/** Adds a change, merged with the one already waiting for the same task. */
export function queueChange(list: Pending[], change: Pending): Pending[] {
  const i = list.findIndex((p) => p.key === change.key);
  if (i < 0) return change.base || change.next ? [...list, change] : list;
  const merged = { ...list[i]!, next: change.next };
  // Created and deleted while offline: nothing to send.
  if (!merged.base && !merged.next) return list.filter((_, j) => j !== i);
  return list.map((p, j) => (j === i ? merged : p));
}

interface StoredPending {
  key: string;
  base: Stored | null;
  next: Stored | null;
}

export interface Outbox {
  load(): Pending[];
  save(list: Pending[]): void;
}

export function createOutbox(calendarId: string, kv: KV = localStorage): Outbox {
  const key = `planner_outbox_${calendarId}`;
  return {
    load: () =>
      read<StoredPending[]>(kv, key, []).map((p) => ({
        key: p.key,
        base: p.base && fromStored(p.base),
        next: p.next && fromStored(p.next),
      })),
    save(list) {
      if (!list.length) {
        try {
          kv.removeItem(key);
        } catch {
          /* storage unavailable */
        }
        return;
      }
      write(
        kv,
        key,
        list.map((p) => ({ key: p.key, base: p.base && toStored(p.base), next: p.next && toStored(p.next) })),
      );
    },
  };
}
