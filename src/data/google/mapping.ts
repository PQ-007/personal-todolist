import { parseYmd, ymd } from '../../domain/dates';
import { DEFAULT_COLOR } from '../../domain/colors';
import { normalizeDescription } from '../../domain/markdown/htmlToMd';
import { applyChecklistState, checklistState, uncheckAll } from '../../domain/markdown/tasks';
import { isLabel } from '../../domain/labels';
import { tagsFromStorage, tagsToStorage } from '../../domain/tags';
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
  originalStartTime?: GEventTime;
  recurrence?: string[];
  extendedProperties?: { private?: Record<string, string>; shared?: Record<string, string> };
}
export type GEventBody = Partial<Omit<GEvent, 'id' | 'etag' | 'status'>>;

/** Private extended property keys this app owns. */
const OWN_KEYS = ['done', 'label', 'tags'] as const;

/**
 * Done and checklist state of one occurrence of a repeating task. Google applies private
 * properties set on an occurrence to its whole series (marking today done marked every day
 * done), so this state lives on the series, keyed by occurrence: `d_<occurrence>` = "1"/"0",
 * `c_<occurrence>` = ticked checklist items such as "101".
 */
const DONE_KEY = 'd_';
const TICKS_KEY = 'c_';
const OCCURRENCE_KEY = /^[dc]_/;
/** Per-occurrence state older than this many days is dropped (Google allows 300 properties). */
const KEEP_DAYS = 60;

/** The part of an occurrence's id after its series id: "20261024T210000Z", or "20261024" all day. */
export function occurrenceKey(t: Pick<Task, 'id' | 'seriesId' | 'originalStart'>): string {
  if (t.seriesId && t.id.startsWith(t.seriesId + '_')) return t.id.slice(t.seriesId.length + 1);
  return (t.originalStart ?? new Date(0)).toISOString().replace(/[-:]|\.\d+/g, '');
}

export const isUsable = (g: GEvent) => g.status !== 'cancelled' && !!g.start && !!g.end;

export function fromGoogle(g: GEvent): Task {
  const allDay = !!g.start?.date;
  const priv = { ...(g.extendedProperties?.private ?? {}) };
  // An occurrence reads its own state from the keys its series holds for it (see DONE_KEY).
  const occ = g.recurringEventId ? occurrenceKey({ id: g.id, seriesId: g.recurringEventId }) : null;
  const done = occ ? priv[DONE_KEY + occ] === '1' : priv.done === '1';
  const ticks = occ ? priv[TICKS_KEY + occ] : undefined;
  const label = priv.label;
  const tags = tagsFromStorage(priv.tags);
  const occurrenceKeys = Object.keys(priv).filter((k) => OCCURRENCE_KEY.test(k));
  for (const k of [...OWN_KEYS, ...occurrenceKeys]) delete priv[k];
  const description = normalizeDescription(g.description);
  return {
    id: g.id,
    etag: g.etag,
    title: g.summary || '(untitled)',
    allDay,
    start: allDay ? parseYmd(g.start!.date!) : new Date(g.start!.dateTime!),
    end: allDay ? parseYmd(g.end!.date!) : new Date(g.end!.dateTime!),
    description: ticks ? applyChecklistState(description, ticks) : description,
    colorId: g.colorId || DEFAULT_COLOR,
    done,
    ...(isLabel(label) ? { label } : {}),
    ...(g.recurrence?.length ? { recurrence: g.recurrence } : {}),
    ...(g.recurringEventId ? { seriesId: g.recurringEventId } : {}),
    ...(g.originalStartTime ? { originalStart: g.originalStartTime.date ? parseYmd(g.originalStartTime.date) : new Date(g.originalStartTime.dateTime!) } : {}),
    ...(occ && occurrenceKeys.length ? { occurrenceKeys } : {}),
    ...(tags.length ? { tags } : {}),
    ...(Object.keys(priv).length ? { extraProps: priv } : {}),
  };
}

/** The browser's time zone; Google requires one on timed repeating events. */
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const timeOf = (allDay: boolean, d: Date): GEventTime => (allDay ? { date: ymd(d) } : { dateTime: d.toISOString(), timeZone: zone() });
/** Like `timeOf`, but explicitly clears the other field so Google drops it. */
const timeSwitch = (allDay: boolean, d: Date): GEventTime =>
  allDay ? { date: ymd(d), dateTime: null } : { dateTime: d.toISOString(), timeZone: zone(), date: null };

/** Empty values clear a label or tags: a PATCH merges private properties, so a missing key would keep the old one. */
const privateOf = (t: NewTask) => ({
  ...(t.extraProps ?? {}),
  done: t.done ? '1' : '0',
  label: t.label ?? '',
  tags: tagsToStorage(t.tags),
});

/** Full body for creating an event. */
export function toGoogle(t: NewTask): GEventBody {
  return {
    summary: t.title,
    description: t.description,
    colorId: t.colorId,
    start: timeOf(t.allDay, t.start),
    end: timeOf(t.allDay, t.end),
    extendedProperties: { private: privateOf(t) },
    ...(t.recurrence?.length ? { recurrence: t.recurrence } : {}),
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
  if ((next.recurrence ?? []).join('\n') !== (prev.recurrence ?? []).join('\n')) b.recurrence = next.recurrence ?? [];
  if (
    next.allDay !== prev.allDay ||
    next.start.getTime() !== prev.start.getTime() ||
    next.end.getTime() !== prev.end.getTime()
  ) {
    const time = next.allDay !== prev.allDay ? timeSwitch : timeOf;
    b.start = time(next.allDay, next.start);
    b.end = time(next.allDay, next.end);
  }
  if (
    next.done !== prev.done ||
    next.label !== prev.label ||
    tagsToStorage(next.tags) !== tagsToStorage(prev.tags) ||
    JSON.stringify(next.extraProps ?? {}) !== JSON.stringify(prev.extraProps ?? {})
  ) {
    b.extendedProperties = { private: privateOf(next) };
  }
  return b;
}

/**
 * For an edit of one occurrence of a repeating task: the done and checklist changes, as
 * properties to set on its series (null deletes), and what is left to save on the occurrence
 * itself. Null when the edit changes neither.
 */
export function occurrenceProps(prev: Task, next: Task, now = new Date()): { props: Record<string, string | null>; rest: Task } | null {
  const occ = occurrenceKey(prev);
  const props: Record<string, string | null> = {};
  let rest = next;
  if (next.done !== prev.done) {
    props[DONE_KEY + occ] = next.done ? '1' : '0';
    rest = { ...rest, done: prev.done };
  }
  if (next.description !== prev.description) {
    if (uncheckAll(next.description) === uncheckAll(prev.description)) {
      // Only ticks changed.
      props[TICKS_KEY + occ] = checklistState(next.description);
      rest = { ...rest, description: prev.description };
    } else if (prev.occurrenceKeys?.includes(TICKS_KEY + occ)) {
      // The notes themselves changed: they are saved on the occurrence with their ticks.
      props[TICKS_KEY + occ] = null;
    }
  }
  if (!Object.keys(props).length) return null;
  const cutoff = ymd(new Date(now.getTime() - KEEP_DAYS * 864e5)).replace(/-/g, '');
  for (const k of prev.occurrenceKeys ?? []) if (k.slice(2, 10) < cutoff && !(k in props)) props[k] = null;
  return { props, rest };
}
