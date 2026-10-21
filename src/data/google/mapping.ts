import { parseYmd, ymd } from '../../domain/dates';
import { DEFAULT_COLOR } from '../../domain/colors';
import { normalizeDescription } from '../../domain/markdown/htmlToMd';
import { isLabel } from '../../domain/labels';
import type { NewTask, Task } from '../../domain/types';

/** The subset of a Google Calendar event resource we use. */
export interface GEventTime {
  /** `null` clears the field in a PATCH (needed when switching between all-day and timed). */
  date?: string | null;
  dateTime?: string | null;
  timeZone?: string;
}
export interface GEvent {
  id: string;
  etag?: string;
  status?: string;
  summary?: string;
  description?: string;
  colorId?: string;
  start?: GEventTime;
  end?: GEventTime;
  recurringEventId?: string;
  extendedProperties?: { private?: Record<string, string>; shared?: Record<string, string> };
}
export type GEventBody = Partial<Omit<GEvent, 'id' | 'etag' | 'status'>>;

/** Private extended property keys this app owns. */
const OWN_KEYS = ['done', 'label'] as const;

export const isUsable = (g: GEvent) => g.status !== 'cancelled' && !!g.start && !!g.end;

export function fromGoogle(g: GEvent): Task {
  const allDay = !!g.start?.date;
  const priv = { ...(g.extendedProperties?.private ?? {}) };
  const done = priv.done === '1';
  const label = priv.label;
  for (const k of OWN_KEYS) delete priv[k];
  return {
    id: g.id,
    etag: g.etag,
    title: g.summary || '(untitled)',
    allDay,
    start: allDay ? parseYmd(g.start!.date!) : new Date(g.start!.dateTime!),
    end: allDay ? parseYmd(g.end!.date!) : new Date(g.end!.dateTime!),
    description: normalizeDescription(g.description),
    colorId: g.colorId || DEFAULT_COLOR,
    done,
    ...(isLabel(label) ? { label } : {}),
    ...(Object.keys(priv).length ? { extraProps: priv } : {}),
  };
}

const timeOf = (allDay: boolean, d: Date): GEventTime => (allDay ? { date: ymd(d) } : { dateTime: d.toISOString() });
/** Like `timeOf`, but explicitly clears the other field so Google drops it. */
const timeSwitch = (allDay: boolean, d: Date): GEventTime =>
  allDay ? { date: ymd(d), dateTime: null } : { dateTime: d.toISOString(), date: null };

/** An empty label clears it: a PATCH merges private properties, so a missing key would keep the old one. */
const privateOf = (t: NewTask) => ({ ...(t.extraProps ?? {}), done: t.done ? '1' : '0', label: t.label ?? '' });

/** Full body for creating an event. */
export function toGoogle(t: NewTask): GEventBody {
  return {
    summary: t.title,
    description: t.description,
    colorId: t.colorId,
    start: timeOf(t.allDay, t.start),
    end: timeOf(t.allDay, t.end),
    extendedProperties: { private: privateOf(t) },
  };
}

/**
 * PATCH body with only the fields that changed. Unchanged descriptions are never sent, so a
 * description Google stored as HTML is only rewritten as markdown when its notes are edited.
 */
export function patchBody(prev: Task, next: Task): GEventBody {
  const b: GEventBody = {};
  if (next.title !== prev.title) b.summary = next.title;
  if (next.description !== prev.description) b.description = next.description;
  if (next.colorId !== prev.colorId) b.colorId = next.colorId;
  if (
    next.allDay !== prev.allDay ||
    next.start.getTime() !== prev.start.getTime() ||
    next.end.getTime() !== prev.end.getTime()
  ) {
    const time = next.allDay !== prev.allDay ? timeSwitch : timeOf;
    b.start = time(next.allDay, next.start);
    b.end = time(next.allDay, next.end);
  }
  if (next.done !== prev.done || next.label !== prev.label || JSON.stringify(next.extraProps ?? {}) !== JSON.stringify(prev.extraProps ?? {})) {
    b.extendedProperties = { private: privateOf(next) };
  }
  return b;
}
