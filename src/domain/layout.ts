/** A piece of an event within one day column, in minutes from that day's midnight. */
export interface Segment {
  sm: number;
  em: number;
}

export type Placed<T extends Segment> = T & { col: number; cols: number };

/**
 * Lays out overlapping segments side by side. Segments that transitively overlap form a
 * cluster; each cluster gets as many columns as it needs, and every member shares that width.
 */
export function layoutDay<T extends Segment>(input: readonly T[]): Placed<T>[] {
  const segs = [...input].sort((a, b) => a.sm - b.sm || b.em - a.em);
  const res: Placed<T>[] = [];
  let cluster: T[] = [];
  let cEnd = -1;
  const flush = () => {
    if (!cluster.length) return;
    const ends: number[] = [];
    const items = cluster.map((s) => {
      let c = ends.findIndex((x) => x <= s.sm);
      if (c < 0) {
        c = ends.length;
        ends.push(0);
      }
      ends[c] = s.em;
      return { s, col: c };
    });
    for (const it of items) res.push({ ...it.s, col: it.col, cols: ends.length });
    cluster = [];
    cEnd = -1;
  };
  for (const s of segs) {
    if (cluster.length && s.sm >= cEnd) flush();
    cluster.push(s);
    cEnd = Math.max(cEnd, s.em);
  }
  flush();
  return res;
}

export interface TaskSegment<T> extends Segment {
  task: T;
  /** The real start/end of the task falls inside this day (false when clipped at midnight). */
  startsHere: boolean;
  endsHere: boolean;
}

/** Timed tasks clipped to one day column, ready for `layoutDay`. */
export function daySegments<T extends { start: Date; end: Date; allDay: boolean }>(
  tasks: readonly T[],
  day: Date,
): TaskSegment<T>[] {
  const ds = day.getTime();
  const next = new Date(day);
  next.setDate(next.getDate() + 1);
  const de = next.getTime();
  return tasks
    .filter((t) => !t.allDay && t.start.getTime() < de && t.end.getTime() > ds)
    .map((t) => ({
      task: t,
      sm: (Math.max(t.start.getTime(), ds) - ds) / 60000,
      em: (Math.min(t.end.getTime(), de) - ds) / 60000,
      startsHere: t.start.getTime() >= ds,
      endsHere: t.end.getTime() <= de,
    }));
}
