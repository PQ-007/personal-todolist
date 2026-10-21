import { useSyncExternalStore } from 'react';
import { copyOf, placeCopy, weekCopies } from '../domain/clipboard';
import { DEFAULT_COLOR } from '../domain/colors';
import { addDays, hm, startOfDay } from '../domain/dates';
import type { NewTask, Task } from '../domain/types';
import { createDemoStore } from '../data/demo/demoStore';
import { clearToken, getToken, hasToken, restoreToken, signIn } from '../data/google/auth';
import { createGoogleStore } from '../data/google/googleStore';
import { createStackStore, type StackStore } from '../data/stackStore';
import { AuthError, ConflictError, type TaskStore } from '../data/store';
import { fmtDate, t as tr } from '../i18n';
import { labelFor, matchesFilter, type LabelFilter } from '../domain/labels';
import { itemFromTask, nextFreeSlot, parseStackInput, taskFromItem, type StackItem } from '../domain/stack';
import { clampSpan, sameRange, stepDay, visibleRange, type DayRange, type View } from '../domain/views';
import {
  loadFilter,
  loadMode,
  loadSettings,
  loadStackOpen,
  loadView,
  saveFilter,
  saveMode,
  saveSettings,
  saveStackOpen,
  saveView,
  type Settings,
} from './settings';

export type SyncState = '' | 'loading' | 'saving' | 'saved' | 'error';

export interface ToastAction {
  label: string;
  run: () => void;
}

/** Focus: today's work, one task at a time. Plan: the calendar and the to-do stack. */
export type Mode = 'focus' | 'plan';

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
}

/**
 * Holds what the UI shows and applies every change optimistically: the UI updates at once,
 * the store call runs in the background, and a failure rolls that task back with a toast.
 * Changes to one task are sent one after another, each diffed against the last state the
 * server confirmed, so rapid edits never race or trip the etag check.
 */
export class Planner {
  private state: PlannerState;
  private listeners = new Set<() => void>();
  private demo = createDemoStore();
  private store!: TaskStore;
  private stackStore!: StackStore;
  /** Last server-confirmed version of each task. */
  private server = new Map<string, Task>();
  /** Per-task queue of pending store calls. */
  private chains = new Map<string, Promise<unknown>>();
  /** Temporary id → real id, once a create has finished. */
  private alias = new Map<string, string>();
  private pending = 0;
  private toastSeq = 0;
  private tmpSeq = 0;
  private loadSeq = 0;

  constructor() {
    restoreToken();
    const day = startOfDay(new Date());
    const { view, span } = loadView();
    this.state = {
      mode: loadMode(),
      view,
      span,
      day,
      range: visibleRange({ view, day, span }),
      tasks: [],
      needAuth: false,
      sync: '',
      toast: null,
      clipboard: null,
      stack: [],
      stackOpen: loadStackOpen(),
      filter: loadFilter(),
      settings: loadSettings(),
    };
    this.store = this.makeStore();
    this.loadStack();
  }

  private loadStack() {
    this.stackStore = createStackStore(this.state.settings.mode);
    this.set({ stack: this.stackStore.load() });
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  get = () => this.state;
  private set(patch: Partial<PlannerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private makeStore(): TaskStore {
    const s = this.state.settings;
    return s.mode === 'google'
      ? createGoogleStore({ calendarId: s.calendarId, getToken, onUnauthorized: clearToken })
      : this.demo;
  }

  toast(msg: string, action?: ToastAction) {
    this.set({ toast: { id: ++this.toastSeq, msg, action } });
  }
  dismissToast() {
    this.set({ toast: null });
  }

  private fail(err: unknown) {
    if (err instanceof AuthError) this.set({ needAuth: true });
    this.set({ sync: 'error' });
    this.toast(err instanceof Error ? err.message : tr('err.generic'));
  }

  /* ---------- loading ---------- */

  async refresh() {
    const seq = ++this.loadSeq;
    if (this.state.settings.mode === 'google' && !hasToken()) {
      this.server.clear();
      this.set({ needAuth: true, tasks: [] });
      return;
    }
    this.set({ needAuth: false, sync: 'loading' });
    try {
      const { from, days } = this.state.range;
      const tasks = await this.store.list(from, addDays(from, days));
      if (seq !== this.loadSeq) return;
      this.server = new Map(tasks.map((t) => [t.id, t]));
      this.set({ tasks, sync: '' });
    } catch (e) {
      if (seq === this.loadSeq) this.fail(e);
    }
  }

  /** Applies a new view, day or span, loading the days on screen when they change. */
  private navigate(patch: Partial<Pick<PlannerState, 'view' | 'day' | 'span'>>) {
    const next = { view: this.state.view, day: this.state.day, span: this.state.span, ...patch };
    next.day = startOfDay(next.day);
    next.span = clampSpan(next.span);
    const range = visibleRange(next);
    const moved = !sameRange(range, this.state.range);
    if (patch.view || patch.span) saveView({ view: next.view, span: next.span });
    this.set({ ...next, range });
    if (moved) void this.refresh();
  }

  setDay(day: Date) {
    this.navigate({ day });
  }
  /** Previous (-1) or next (1) day, days, week or month, depending on the view. */
  step(n: number) {
    this.navigate({ day: stepDay(this.state, n) });
  }
  /** Previous or next day, whatever the view (the focus mode always moves by a day). */
  stepDay(n: number) {
    this.navigate({ day: addDays(this.state.day, n) });
  }
  /** Picking a calendar view always shows the calendar. */
  setView(view: View, span?: number) {
    this.setMode('plan');
    this.navigate(span ? { view, span } : { view });
  }
  setMode(mode: Mode) {
    if (mode === this.state.mode) return;
    saveMode(mode);
    this.set({ mode });
  }
  setFilter(filter: LabelFilter) {
    saveFilter(filter);
    this.set({ filter });
  }

  /* ---------- auth & settings ---------- */

  async connect() {
    try {
      await signIn(this.state.settings.clientId);
      await this.refresh();
    } catch (e) {
      this.toast(e instanceof Error ? e.message : tr('err.signIn'));
    }
  }

  async applySettings(settings: Settings) {
    saveSettings(settings);
    this.set({ settings, tasks: [] });
    this.server.clear();
    this.store = this.makeStore();
    this.loadStack();
    if (settings.mode === 'google' && !hasToken()) await this.connect();
    else await this.refresh();
  }

  resetDemo() {
    this.demo.reset();
    this.toast(tr('set.demoReset'));
    if (this.state.settings.mode === 'demo') void this.refresh();
  }

  /* ---------- mutations ---------- */

  /** The current id of a task (a temporary id becomes the real one once created). */
  private realId = (id: string) => this.alias.get(id) ?? id;
  /** Queue key for a task: the id it was first known by in this session. */
  private keyOf = (id: string) => [...this.alias].find(([, v]) => v === id)?.[0] ?? id;

  find = (id: string) => this.state.tasks.find((t) => t.id === this.realId(id));

  /** Runs `job` after earlier jobs for the same task; `latest` tells whether nothing newer was queued. */
  private async enqueue<T>(key: string, job: () => Promise<T>): Promise<{ value: T; latest: boolean }> {
    const run = (this.chains.get(key) ?? Promise.resolve()).catch(() => {}).then(job);
    this.chains.set(key, run);
    this.pending++;
    this.set({ sync: 'saving' });
    try {
      const value = await run;
      return { value, latest: this.chains.get(key) === run };
    } finally {
      if (this.chains.get(key) === run) this.chains.delete(key);
      if (--this.pending === 0 && this.state.sync === 'saving') this.set({ sync: 'saved' });
    }
  }

  private replace(id: string, next: Task | null) {
    const tasks = this.state.tasks.filter((t) => t.id !== id || next);
    this.set({ tasks: next ? tasks.map((t) => (t.id === id ? next : t)) : tasks });
  }

  create(input: NewTask): Promise<void> {
    return this.startCreate(input).done;
  }

  /** Shows the task at once under a temporary id and saves it in the background. */
  private startCreate(input: NewTask): { id: string; done: Promise<void> } {
    const tmpId = `tmp-${Date.now().toString(36)}-${++this.tmpSeq}`;
    this.set({ tasks: [...this.state.tasks, { ...input, id: tmpId }] });
    return { id: tmpId, done: this.finishCreate(tmpId, input) };
  }

  private async finishCreate(tmpId: string, input: NewTask): Promise<void> {
    try {
      const { value: real, latest } = await this.enqueue(tmpId, async () => {
        const real = await this.store.create(input);
        this.alias.set(tmpId, real.id);
        this.server.set(real.id, real);
        return real;
      });
      const cur = this.state.tasks.find((t) => t.id === tmpId);
      // If the task was edited while being created, keep those edits (they are queued).
      this.replace(tmpId, latest || !cur ? real : { ...cur, id: real.id, etag: real.etag });
    } catch (e) {
      this.replace(tmpId, null);
      this.fail(e);
    }
  }

  async update(next: Task): Promise<void> {
    const id = this.realId(next.id);
    this.replace(id, { ...next, id });
    const key = this.keyOf(id);
    try {
      const { value: real, latest } = await this.enqueue(key, () => {
        const rid = this.realId(key);
        return this.store.update(this.server.get(rid) ?? { ...next, id: rid }, { ...next, id: rid });
      });
      this.server.set(real.id, real);
      if (latest) this.replace(this.realId(id), real);
    } catch (e) {
      const rid = this.realId(id);
      const known = this.server.get(rid);
      if (known) this.replace(rid, known);
      this.fail(e);
      if (e instanceof ConflictError) void this.refresh();
    }
  }

  async remove(id0: string): Promise<void> {
    const id = this.realId(id0);
    const before = this.find(id);
    if (!before) return;
    this.replace(id, null);
    const key = this.keyOf(id);
    try {
      await this.enqueue(key, () => this.store.remove(this.realId(key)));
      this.server.delete(this.realId(key));
    } catch (e) {
      const rid = this.realId(key);
      this.set({ tasks: [...this.state.tasks, this.server.get(rid) ?? { ...before, id: rid }] });
      this.fail(e);
    }
  }

  /** Deletes a task and offers to bring it back. */
  deleteWithUndo(id: string) {
    const t = this.find(id);
    if (!t) return;
    void this.remove(id);
    this.toast(tr('toast.deleted', { title: t.title }), {
      label: tr('toast.undo'),
      run: () => void this.create({ ...copyOf(t), done: t.done, extraProps: t.extraProps }),
    });
  }

  copy(id: string) {
    const t = this.find(id);
    if (!t) return;
    this.set({ clipboard: copyOf(t) });
    this.toast(tr('toast.copied', { title: t.title }));
  }

  /** Creates a copy at the same time. */
  duplicate(id: string) {
    const t = this.find(id);
    if (t) void this.create(copyOf(t));
  }

  /** Moves a task by whole days, keeping its times. */
  moveDays(id: string, n: number) {
    const t = this.find(id);
    if (t) void this.update({ ...t, start: addDays(t.start, n), end: addDays(t.end, n) });
  }

  /**
   * Copies the 7 days before the range on screen into it (5 in the workdays view), only the
   * labels the filter shows, skipping tasks already there. Undo removes them.
   */
  async copyPreviousWeek() {
    const { range, filter } = this.state;
    const { days } = range;
    const from = addDays(range.from, -7);
    let source: Task[];
    try {
      source = await this.store.list(from, addDays(from, days));
    } catch (e) {
      this.fail(e);
      return;
    }
    // The week on screen may have changed while last week was loading.
    if (!sameRange(this.state.range, range)) return;
    const copies = weekCopies(
      source.filter((t) => matchesFilter(t, filter)),
      this.state.tasks,
      from,
      days,
    );
    if (!copies.length) {
      this.toast(tr('toast.weekNothing'));
      return;
    }
    const ids = copies.map((c) => this.startCreate(c).id);
    this.toast(tr('toast.weekCopied', { n: copies.length }), {
      label: tr('toast.undo'),
      run: () => ids.forEach((id) => void this.remove(id)),
    });
  }

  /** Pastes the copied task on `day`, at `time` if given (see `placeCopy`). */
  paste(day: Date, time?: Date) {
    const c = this.state.clipboard;
    if (c) void this.create(placeCopy(c, day, time));
  }

  /* ---------- to-do stack ---------- */

  setStackOpen(open: boolean) {
    saveStackOpen(open);
    this.set({ stackOpen: open });
  }

  private setStack(stack: StackItem[]) {
    this.stackStore.save(stack);
    this.set({ stack });
  }

  private newStackId = () => `s-${Date.now().toString(36)}-${++this.tmpSeq}`;

  /** Adds a to-do from quick-add text ("Write report 1h"); it gets the label being shown. */
  addToStack(text: string) {
    const parsed = parseStackInput(text);
    if (!parsed) return;
    const item: StackItem = {
      id: this.newStackId(),
      ...parsed,
      description: '',
      colorId: DEFAULT_COLOR,
      label: labelFor(this.state.filter),
    };
    this.setStack([...this.state.stack, item]);
  }

  updateStackItem(id: string, patch: Partial<Omit<StackItem, 'id'>>) {
    this.setStack(this.state.stack.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  /** Moves an item so it ends up at `index` in the list as it is now. */
  moveStackItem(id: string, index: number) {
    const from = this.state.stack.findIndex((s) => s.id === id);
    if (from < 0) return;
    const next = [...this.state.stack];
    const [item] = next.splice(from, 1);
    next.splice(from < index ? index - 1 : index, 0, item!);
    this.setStack(next);
  }

  /** Takes an item out of the stack; returns it with its position, to put it back on undo. */
  private takeStackItem(id: string): { item: StackItem; index: number } | null {
    const index = this.state.stack.findIndex((s) => s.id === id);
    if (index < 0) return null;
    const item = this.state.stack[index]!;
    this.setStack(this.state.stack.filter((s) => s.id !== id));
    return { item, index };
  }

  private putBack(item: StackItem, index: number) {
    const next = [...this.state.stack];
    next.splice(Math.min(index, next.length), 0, item);
    this.setStack(next);
  }

  deleteStackItem(id: string) {
    const taken = this.takeStackItem(id);
    if (!taken) return;
    this.toast(tr('toast.deleted', { title: taken.item.title }), {
      label: tr('toast.undo'),
      run: () => this.putBack(taken.item, taken.index),
    });
  }

  /** Puts a to-do on the calendar at `start` (or on that day when `allDay`). Undo puts it back. */
  scheduleItem(id: string, start: Date, allDay = false) {
    const taken = this.takeStackItem(id);
    if (!taken) return;
    const { id: taskId } = this.startCreate(taskFromItem(taken.item, start, allDay));
    const when = fmtDate(start, { month: 'short', day: 'numeric', weekday: 'short' }) + (allDay ? '' : ' ' + hm(start));
    this.toast(tr('stack.scheduled', { title: taken.item.title, when }), {
      label: tr('toast.undo'),
      run: () => {
        void this.remove(taskId);
        this.putBack(taken.item, taken.index);
      },
    });
  }

  /** Schedules a to-do at the first free time on `day` (see `nextFreeSlot`). */
  async scheduleItemOn(id: string, day: Date) {
    const item = this.state.stack.find((s) => s.id === id);
    if (!item) return;
    const d = startOfDay(day);
    const { from, days } = this.state.range;
    let tasks = this.state.tasks;
    if (d < from || d >= addDays(from, days)) {
      try {
        tasks = await this.store.list(d, addDays(d, 1));
      } catch (e) {
        this.fail(e);
        return;
      }
    }
    this.scheduleItem(id, nextFreeSlot(tasks, d, item.minutes, new Date()));
  }

  /** Moves a calendar task back to the top of the stack. Undo restores the task. */
  unschedule(taskId: string) {
    const t = this.find(taskId);
    if (!t) return;
    const item = itemFromTask(t, this.newStackId());
    this.setStack([item, ...this.state.stack]);
    void this.remove(t.id);
    this.toast(tr('stack.moved', { title: t.title }), {
      label: tr('toast.undo'),
      run: () => {
        this.takeStackItem(item.id);
        void this.create({ ...copyOf(t), done: t.done, extraProps: t.extraProps });
      },
    });
  }

  patch(id: string, patch: Partial<Task>) {
    const t = this.find(id);
    if (t) return this.update({ ...t, ...patch });
  }

  toggleDone(id: string) {
    const t = this.find(id);
    if (t) return this.update({ ...t, done: !t.done });
  }
}

export const planner = new Planner();
export const usePlanner = () => useSyncExternalStore(planner.subscribe, planner.get);
