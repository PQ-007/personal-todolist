import { parseYmd, withTime, ymd } from '../../domain/dates';
import { occurrences, parseRule } from '../../domain/recurrence';
import type { NewTask, Task } from '../../domain/types';
import type { TaskStore } from '../store';
import { seedWeek } from './seed';

// Bumped when the sample data changes, so existing browsers pick up the new set.
const DEMO_KEY = 'planner_demo_v3';

/** Minimal key/value storage, so tests can swap out localStorage. */
export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/**
 * What the demo keeps: plain tasks, repeating series (with `recurrence`), and changed or
 * deleted occurrences of a series (with `seriesId`; deleted ones are `cancelled`).
 */
type Row = Task & { cancelled?: boolean };
type Stored = Omit<Row, 'start' | 'end' | 'originalStart'> & { start: string; end: string; originalStart?: string };

/** An occurrence's id, like Google's: the series id plus the day it was first due. */
const occurrenceId = (seriesId: string, at: Date) => `${seriesId}_${ymd(at).replace(/-/g, '')}`;

/** Sample data saved in this browser only. Series repeat the way Google Calendar's do. */
export function createDemoStore(kv: KV = localStorage): TaskStore & { reset(): void } {
  let data: Row[] | null = null;

  const load = (): Row[] => {
    if (data) return data;
    const raw = kv.getItem(DEMO_KEY);
    if (raw) {
      try {
        data = (JSON.parse(raw) as Stored[]).map(({ originalStart, ...e }) => ({
          ...e,
          start: new Date(e.start),
          end: new Date(e.end),
          ...(originalStart ? { originalStart: new Date(originalStart) } : {}),
        }));
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
  const copy = (t: Row): Task => {
    const { cancelled: _, ...task } = t;
    return { ...task };
  };
  const save = (rows: Row[]) => {
    data = rows;
    persist();
  };

  /** The occurrence of `series` that was first due at `at`, as the calendar shows it. */
  const occurrence = (series: Row, at: Date): Task => {
    const { recurrence: _, ...fields } = copy(series);
    const len = series.end.getTime() - series.start.getTime();
    return { ...fields, id: occurrenceId(series.id, at), seriesId: series.id, originalStart: at, start: at, end: new Date(at.getTime() + len), done: false };
  };

  /** Finds the series and first-due time behind an occurrence id that has no row yet. */
  const fromOccurrenceId = (id: string): { series: Row; at: Date } | null => {
    const m = /^(.*)_(\d{4})(\d{2})(\d{2})$/.exec(id);
    const series = m && load().find((r) => r.id === m[1] && r.recurrence);
    if (!m || !series) return null;
    const day = parseYmd(`${m[2]}-${m[3]}-${m[4]}`);
    return { series, at: series.allDay ? day : withTime(day, series.start.getHours(), series.start.getMinutes()) };
  };

  return {
    kind: 'demo',
    async list(from, to) {
      const rows = load();
      const changed = new Set(rows.filter((r) => r.seriesId).map((r) => r.id));
      const out: Task[] = [];
      for (const r of rows) {
        if (r.seriesId) {
          // A changed occurrence shows where it now is; a deleted one not at all.
          if (!r.cancelled && r.end > from && r.start < to) out.push(copy(r));
          continue;
        }
        const rule = parseRule(r.recurrence);
        if (!rule) {
          if (r.end > from && r.start < to) out.push(copy(r));
          continue;
        }
        for (const at of occurrences(rule, r.start, r.end.getTime() - r.start.getTime(), from, to)) {
          if (!changed.has(occurrenceId(r.id, at))) out.push(occurrence(r, at));
        }
      }
      return out;
    },
    async create(t: NewTask) {
      const e: Row = { ...t, id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) };
      save([...load(), e]);
      return copy(e);
    },
    async update(prev, next) {
      const rows = load();
      if (rows.some((r) => r.id === prev.id)) {
        const e: Row = { ...next, id: prev.id };
        save(rows.map((r) => (r.id === prev.id ? e : r)));
        return copy(e);
      }
      // First change to one occurrence of a series: keep it as its own row.
      const e: Row = { ...next, id: prev.id, seriesId: prev.seriesId, originalStart: prev.originalStart };
      save([...rows, e]);
      return copy(e);
    },
    async remove(id) {
      const rows = load();
      const row = rows.find((r) => r.id === id);
      if (row?.recurrence) return save(rows.filter((r) => r.id !== id && r.seriesId !== id));
      if (row?.seriesId) return save(rows.map((r) => (r.id === id ? { ...r, cancelled: true } : r)));
      if (row) return save(rows.filter((r) => r.id !== id));
      // An occurrence that was never changed: remember it as deleted.
      const occ = fromOccurrenceId(id);
      if (occ) save([...rows, { ...occurrence(occ.series, occ.at), cancelled: true }]);
    },
    async getSeries(id) {
      const series = load().find((r) => r.id === id && r.recurrence);
      if (!series) throw new Error('Series not found');
      return copy(series);
    },
    reset() {
      kv.removeItem(DEMO_KEY);
      data = null;
    },
  };
}
