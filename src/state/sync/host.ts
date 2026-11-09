import type { TaskStore } from '../../data/store';
import { addDays } from '../../domain/dates';
import type { Task } from '../../domain/types';
import type { DayRange } from '../../domain/views';

/** `offline`: Google can't be reached; changes are kept in this browser until it can. */
export type SyncState = '' | 'loading' | 'saving' | 'saved' | 'error' | 'offline';

export interface ToastAction {
  label: string;
  run: () => void;
}

/**
 * What the sync classes need from the planner that owns them: the tasks on screen, its status
 * and toasts, and its loading. They never touch its state otherwise.
 */
export interface SyncHost {
  /** Where changes are sent. */
  store(): TaskStore;
  /** Whether that is Google Calendar (the demo calendar is never offline). */
  google(): boolean;

  /** The tasks on screen. */
  tasks(): Task[];
  setTasks(tasks: Task[]): void;
  /** The days on screen. */
  range(): DayRange;
  /** `tasks` as loaded, with every change still being saved shown on top. */
  withUnsent(tasks: Task[]): Task[];

  sync(): SyncState;
  setSync(sync: SyncState): void;
  /** How many changes wait in the outbox. */
  setUnsent(n: number): void;
  toast(msg: string, action?: ToastAction): void;
  /** Reports an error: a toast, and a sign-in or offline state where it means that. */
  fail(e: unknown): void;

  /** Reloads the days on screen; resolves once they're loaded, by this load or a newer one. */
  refresh(): Promise<void>;
  /** The latest load. */
  loading(): Promise<void>;
  /** How many loads have started (a load numbered higher started later). */
  loadSeq(): number;
}

/** Swaps task `id` on screen for `next` (null: takes it off). */
export function replaceShown(host: SyncHost, id: string, next: Task | null) {
  const tasks = host.tasks().filter((t) => t.id !== id || next);
  host.setTasks(next ? tasks.map((t) => (t.id === id ? next : t)) : tasks);
}

/** Whether a task shows in the days on screen. */
export function showsIn(host: SyncHost): (t: Task) => boolean {
  const { from, days } = host.range();
  const to = addDays(from, days);
  return (t) => t.end > from && t.start < to;
}
