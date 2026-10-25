import type { Label } from './labels';

/** A task is one Google Calendar event (or one demo event). */
export interface Task {
  id: string;
  title: string;
  /** Markdown notes. */
  description: string;
  start: Date;
  /** Exclusive end. For all-day tasks this is midnight of the day after the last day. */
  end: Date;
  allDay: boolean;
  /** Google Calendar colorId. */
  colorId: string;
  done: boolean;
  /** Work or personal; unset for unlabeled tasks. */
  label?: Label;
  /** Free-form tags without "#" (see tags.ts). */
  tags?: string[];
  /** RRULE lines of a repeating series (see recurrence.ts); set on the series itself. */
  recurrence?: string[];
  /** On one occurrence of a series: the series' id, and when this occurrence was first due. */
  seriesId?: string;
  originalStart?: Date;
  /** Google's version tag, used to detect edits made elsewhere before we overwrite them. */
  etag?: string;
  /** Private extended properties we don't manage ourselves; kept so we never drop them. */
  extraProps?: Record<string, string>;
}

/** A task without an id, as passed to `create`. */
export type NewTask = Omit<Task, 'id' | 'etag'>;
