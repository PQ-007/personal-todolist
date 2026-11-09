import type { LabelFilter } from '../domain/labels';
import type { StackItem } from '../domain/stack';
import type { NewTask, Task } from '../domain/types';
import type { DayRange, View } from '../domain/views';
import type { Settings } from './settings';
import type { SyncState, ToastAction } from './sync';

/** Focus: today's work, one task at a time. Plan: the calendar and the to-do stack. */
export type Mode = 'focus' | 'plan';

/** Everything the UI shows. */
export interface PlannerState {
  mode: Mode;
  view: View;
  /** Columns in the day view (1–7). */
  span: number;
  /** The selected day: the sidebar lists it and every view contains it. */
  day: Date;
  /** The days on screen, which are the days loaded. */
  range: DayRange;
  tasks: Task[];
  needAuth: boolean;
  sync: SyncState;
  toast: { id: number; msg: string; action?: ToastAction } | null;
  /** Which labels to show. */
  filter: LabelFilter;
  /** The task last copied, ready to paste. */
  clipboard: NewTask | null;
  /** To-dos without a time yet, in the user's order. */
  stack: StackItem[];
  stackOpen: boolean;
  settings: Settings;
  /** Changes made offline that haven't reached Google yet. */
  unsent: number;
}

/** Reading and changing the planner's state, for the parts it's made of (`DayLoader`, `TodoStack`). */
export interface StateAccess {
  get(): PlannerState;
  set(patch: Partial<PlannerState>): void;
  toast(msg: string, action?: ToastAction): void;
  fail(e: unknown): void;
}
