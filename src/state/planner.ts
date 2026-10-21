import { useSyncExternalStore } from 'react';
import { copyOf, placeCopy, weekCopies } from '../domain/clipboard';
import { addDays, mondayOf, startOfDay } from '../domain/dates';
import type { NewTask, Task } from '../domain/types';
import { createDemoStore } from '../data/demo/demoStore';
import { clearToken, getToken, hasToken, restoreToken, signIn } from '../data/google/auth';
import { createGoogleStore } from '../data/google/googleStore';
import { AuthError, ConflictError, type TaskStore } from '../data/store';
import { t as tr } from '../i18n';
import { matchesFilter, type LabelFilter } from '../domain/labels';
import { loadFilter, saveFilter, loadSettings, saveSettings, type Settings } from './settings';

export type SyncState = '' | 'loading' | 'saving' | 'saved' | 'error';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface PlannerState {
  view: 'day' | 'workweek' | 'week';
  /** The selected day: the day view and the sidebar show it, the week views show its week. */
  day: Date;
  week: Date;
  tasks: Task[];
  needAuth: boolean;
  sync: SyncState;
  toast: { id: number; msg: string; action?: ToastAction } | null;
  /** Which labels to show. */
  filter: LabelFilter;
  /** The task last copied, ready to paste. */
  clipboard: NewTask | null;
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
    this.state = {
      view: 'day',
      day,
      week: mondayOf(day),
      tasks: [],
      needAuth: false,
      sync: '',
      toast: null,
      clipboard: null,
      filter: loadFilter(),
      settings: loadSettings(),
    };
    this.store = this.makeStore();
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
      const tasks = await this.store.list(this.state.week, addDays(this.state.week, 7));
      if (seq !== this.loadSeq) return;
      this.server = new Map(tasks.map((t) => [t.id, t]));
      this.set({ tasks, sync: '' });
    } catch (e) {
      if (seq === this.loadSeq) this.fail(e);
    }
  }

  /** Selects `day`, loading its week if needed. */
  setDay(day: Date) {
    const d = startOfDay(day);
    const week = mondayOf(d);
    const moved = week.getTime() !== this.state.week.getTime();
    this.set({ day: d, week });
    if (moved) void this.refresh();
  }
  shiftDay(n: number) {
    this.setDay(addDays(this.state.day, n));
  }
  shiftWeek(n: number) {
    this.setDay(addDays(this.state.day, 7 * n));
  }
  setFilter(filter: LabelFilter) {
    saveFilter(filter);
    this.set({ filter });
  }
  setView(view: PlannerState['view']) {
    this.set({ view });
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
   * Copies last week's tasks into the week on screen: its first `days` days (5 for the
   * workdays view), only labels the filter shows, skipping tasks already there. Undo removes them.
   */
  async copyPreviousWeek(days: number) {
    const { week, filter } = this.state;
    const from = addDays(week, -7);
    let source: Task[];
    try {
      source = await this.store.list(from, addDays(from, days));
    } catch (e) {
      this.fail(e);
      return;
    }
    // The week on screen may have changed while last week was loading.
    if (this.state.week.getTime() !== week.getTime()) return;
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
