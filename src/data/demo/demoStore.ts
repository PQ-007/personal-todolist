import type { NewTask, Task } from '../../domain/types';
import type { TaskStore } from '../store';
import { seedWeek } from './seed';

const DEMO_KEY = 'planner_demo_v1';

/** Minimal key/value storage, so tests can swap out localStorage. */
export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

type Stored = Omit<Task, 'start' | 'end'> & { start: string; end: string };

/** Sample data saved in this browser only. */
export function createDemoStore(kv: KV = localStorage): TaskStore & { reset(): void } {
  let data: Task[] | null = null;

  const load = (): Task[] => {
    if (data) return data;
    const raw = kv.getItem(DEMO_KEY);
    if (raw) {
      try {
        data = (JSON.parse(raw) as Stored[]).map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) }));
        return data;
      } catch {
        /* corrupt: reseed */
      }
    }
    data = seedWeek();
    persist();
    return data;
  };
  const persist = () => kv.setItem(DEMO_KEY, JSON.stringify(data));
  const copy = (t: Task): Task => ({ ...t });

  return {
    kind: 'demo',
    async list(from, to) {
      return load()
        .filter((e) => e.end > from && e.start < to)
        .map(copy);
    },
    async create(t: NewTask) {
      const e: Task = { ...t, id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) };
      data = [...load(), e];
      persist();
      return copy(e);
    },
    async update(prev, next) {
      const e = { ...next, id: prev.id };
      data = load().map((x) => (x.id === prev.id ? e : x));
      persist();
      return copy(e);
    },
    async remove(id) {
      data = load().filter((e) => e.id !== id);
      persist();
    },
    reset() {
      kv.removeItem(DEMO_KEY);
      data = null;
    },
  };
}
