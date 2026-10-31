import { useSyncExternalStore } from 'react';
import { copyOf, placeCopy, weekCopies } from '../domain/clipboard';
import { addDays, dayDiff, hm, startOfDay, withTime } from '../domain/dates';
import type { NewTask, Task } from '../domain/types';
import { createDemoStore } from '../data/demo/demoStore';
import { authUnreachable, clearToken, ensureToken, getToken, restoreToken, signIn, signOut } from '../data/google/auth';
import { createGoogleStore } from '../data/google/googleStore';
import { createStackStore, type StackStore } from '../data/stackStore';
import { createOutbox, createTaskCache, queueChange, type Outbox, type Pending, type TaskCache } from '../data/offline';
import { AuthError, ConflictError, OfflineError, type TaskStore } from '../data/store';
import { fmtDate, t as tr } from '../i18n';
import { matchesFilter, type LabelFilter } from '../domain/labels';
import { splitRule } from '../domain/recurrence';
import { itemFromTask, nextFreeSlot, taskFromItem, type StackItem } from '../domain/stack';
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

/** `offline`: Google can't be reached; changes are kept in this browser until it can. */
export type SyncState = '' | 'loading' | 'saving' | 'saved' | 'error' | 'offline';

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
  /** Changes made offline that haven't reached Google yet. */
  unsent: number;
}

/**
 * Holds what the UI shows and applies every change optimistically: the UI updates at once,
 * the store call runs in the background, and a failure rolls that task back with a toast.
 * Changes to one task are sent one after another, each diffed against the last state the
 * server confirmed, so rapid edits never race or trip the etag check.
 *
 * Offline, changes stay on screen and wait in an outbox (one merged change per task, kept in
 * this browser), and the days last loaded are shown from a cache. The outbox is sent when the
 * connection comes back, or on the next start.
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
  private cache!: TaskCache;
  private outboxStore!: Outbox;
  private outbox: Pending[] = [];
  /** Set while Google can't be reached: changes go straight to the outbox. */
  private offline = false;
  private flushing = false;
  private retryTimer: ReturnType<typeof setInterval> | undefined;

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
      unsent: 0,
    };
    this.store = this.makeStore();
    this.loadOffline();
    globalThis.addEventListener?.('online', () => void this.reconnect());
    this.loadStack();
    // Back from a sign-in that Google or the auth function turned down.
    const authError = new URLSearchParams(location.search).get('auth');
    if (authError) {
      history.replaceState(null, '', location.pathname);
      this.toast(tr(authError === 'scope' ? 'err.scope' : 'err.signIn'));
    }
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

  private loadOffline() {
    const cal = this.state.settings.calendarId || 'primary';
    this.cache = createTaskCache(cal);
    this.outboxStore = createOutbox(cal);
    this.outbox = this.state.settings.mode === 'google' ? this.outboxStore.load() : [];
    this.set({ unsent: this.outbox.length });
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
    if (err instanceof OfflineError) this.goOffline();
    this.set({ sync: err instanceof OfflineError ? 'offline' : 'error' });
    this.toast(err instanceof Error ? err.message : tr('err.generic'));
  }

  /* ---------- loading ---------- */

  async refresh() {
    const seq = ++this.loadSeq;
    const google = this.state.settings.mode === 'google';
    if (google && !(await ensureToken())) {
      if (seq !== this.loadSeq) return;
      if (authUnreachable()) return this.showOffline();
      this.server.clear();
      this.set({ needAuth: true, tasks: [] });
      return;
    }
    this.set({ needAuth: false, sync: 'loading' });
    const { from, days } = this.state.range;
    try {
      const tasks = await this.store.list(from, addDays(from, days));
      if (seq !== this.loadSeq) return;
      if (google) this.cache.put(from, days, tasks);
      this.server = new Map(tasks.map((t) => [t.id, t]));
      this.set({ tasks: this.withUnsent(tasks), sync: '' });
      if (this.offline) this.backOnline();
      if (this.outbox.length) void this.flush();
    } catch (e) {
      if (seq !== this.loadSeq) return;
      if (e instanceof OfflineError) this.showOffline();
      else this.fail(e);
    }
  }

  /* ---------- offline ---------- */

  /** The days on screen as last loaded, with the changes still waiting to be sent. */
  private showOffline() {
    const { from, days } = this.state.range;
    const cached = this.cache.get(from, days);
    if (cached) this.server = new Map(cached.map((t) => [t.id, t]));
    this.set({ needAuth: false, tasks: this.withUnsent(cached ?? this.state.tasks) });
    this.goOffline();
  }

  /** `tasks` as loaded, with the outbox's changes applied on top. */
  private withUnsent(tasks: Task[]): Task[] {
    const { from, days } = this.state.range;
    const to = addDays(from, days);
    let out = tasks;
    for (const p of this.outbox) {
      const ids = [p.key, p.base?.id, p.next?.id];
      out = out.filter((t) => !ids.includes(t.id));
      if (p.next && p.next.end > from && p.next.start < to) out = [...out, p.next];
    }
    return out;
  }

  private goOffline() {
    if (!this.offline) this.toast(tr('offline.toast'));
    this.offline = true;
    this.set({ sync: 'offline' });
    // `online` events aren't reliable (captive portals, flaky Wi-Fi): also try now and then.
    this.retryTimer ??= setInterval(() => void this.reconnect(), 30_000);
  }

  private backOnline() {
    this.offline = false;
    clearInterval(this.retryTimer);
    this.retryTimer = undefined;
    if (this.state.sync === 'offline') this.set({ sync: '' });
  }

  /** Tries Google again: reloads the days on screen, which sends the outbox if it works. */
  private async reconnect() {
    if (this.state.settings.mode === 'google' && this.offline) await this.refresh();
  }

  private hold(change: Pending) {
    this.outbox = queueChange(this.outbox, change);
    this.outboxStore.save(this.outbox);
    this.set({ unsent: this.outbox.length });
    this.goOffline();
  }

  /**
   * Sends a change, or keeps it in the outbox when offline (or when an earlier change to the
   * same task is still waiting there, so they arrive in order). Null when kept.
   */
  private async sendOrHold<T>(change: Pending, send: () => Promise<T>): Promise<T | null> {
    if (!this.offline && !this.outbox.some((p) => p.key === change.key)) {
      try {
        return await send();
      } catch (e) {
        if (!(e instanceof OfflineError)) throw e;
      }
    }
    this.hold(change);
    return null;
  }

  /** Sends what was changed offline, one task at a time, then reloads. */
  private async flush() {
    if (this.flushing || this.offline) return;
    this.flushing = true;
    let sent = 0;
    try {
      while (this.outbox.length && !this.offline) {
        const p = this.outbox[0]!;
        // Out of the outbox while it's sent: edits made meanwhile are queued after it as usual.
        this.outbox = this.outbox.slice(1);
        this.outboxStore.save(this.outbox);
        try {
          await this.enqueue(p.key, () => this.sendPending(p));
          sent++;
        } catch (e) {
          if (e instanceof OfflineError) {
            this.outbox = queueChange([p, ...this.outbox.filter((q) => q.key !== p.key)], this.outbox.find((q) => q.key === p.key) ?? p);
            this.outboxStore.save(this.outbox);
            this.goOffline();
          } else {
            // Changed or deleted elsewhere meanwhile: that version wins.
            sent++;
            this.toast(e instanceof Error ? e.message : tr('err.generic'));
          }
        }
        this.set({ unsent: this.outbox.length });
      }
    } finally {
      this.flushing = false;
    }
    if (sent) {
      if (!this.outbox.length) this.toast(tr('offline.synced'));
      void this.refresh();
    }
  }

  private async sendPending({ key, base, next }: Pending) {
    if (!next) {
      if (base) await this.store.remove(this.realId(base.id));
      this.server.delete(this.realId(key));
      return;
    }
    const { id: _, etag: __, ...fields } = next;
    const real = base ? await this.store.update(base, { ...next, id: this.realId(base.id) }) : await this.store.create(fields);
    if (!base) this.alias.set(key, real.id);
    this.server.set(real.id, real);
    const shown = this.state.tasks.find((t) => t.id === key || t.id === real.id);
    if (shown) this.replace(shown.id, { ...shown, id: real.id, etag: real.etag });
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

  /**
   * Tasks in any range, for overviews such as the mini calendar's busy days. Unlike `refresh`
   * it changes nothing on screen, and a failure just returns nothing (no toast).
   */
  async peek(from: Date, to: Date): Promise<Task[]> {
    if (this.state.settings.mode === 'google' && !(await ensureToken())) return [];
    try {
      return await this.store.list(from, to);
    } catch {
      return [];
    }
  }

  /**
   * Tasks whose title or notes contain `query`, from a year back to a year ahead, nearest to
   * today first. A repeating task shows once, as its nearest occurrence. Empty on failure.
   */
  async search(query: string): Promise<Task[]> {
    const now = new Date();
    if (this.state.settings.mode === 'google' && !(await ensureToken())) return [];
    let found: Task[];
    try {
      found = await this.store.search(query, addDays(now, -365), addDays(now, 365));
    } catch {
      return [];
    }
    const dist = (t: Task) => Math.abs(t.start.getTime() - now.getTime());
    const nearest = new Map<string, Task>();
    for (const t of found) {
      const key = t.seriesId ?? t.id;
      const seen = nearest.get(key);
      if (!seen || dist(t) < dist(seen)) nearest.set(key, t);
    }
    return [...nearest.values()].sort((a, b) => dist(a) - dist(b));
  }

  /** Shows the day `task` is on, resolving once it's loaded (so the task can be opened). */
  async goTo(task: Task) {
    this.setDay(task.start);
    if (!this.find(task.id)) await this.refresh();
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

  async disconnect() {
    await signOut();
    this.server.clear();
    this.set({ needAuth: true, tasks: [] });
  }

  async applySettings(settings: Settings) {
    saveSettings(settings);
    this.set({ settings, tasks: [] });
    this.server.clear();
    this.store = this.makeStore();
    this.loadStack();
    this.loadOffline();
    this.backOnline();
    if (settings.mode === 'google' && !(await ensureToken())) await this.connect();
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
    const { done } = this.startCreate(input);
    // A new series shows as one task until its occurrences are loaded.
    return input.recurrence?.length ? done.then(() => this.refresh()) : done;
  }

  /* ---------- repeating tasks ---------- */

  /** The series a task belongs to: itself when it is one, its series for an occurrence, else null. */
  async seriesOf(task: Task): Promise<Task | null> {
    if (task.recurrence?.length) return task;
    if (!task.seriesId) return null;
    try {
      return await this.store.getSeries(task.seriesId);
    } catch (e) {
      this.fail(e);
      return null;
    }
  }

  /**
   * Applies an edit to every occurrence: the series keeps its first day and takes the edited
   * fields, time of day and length. Without a rule the series stops repeating and this
   * occurrence becomes a plain task. Reloads afterwards, since every occurrence may change.
   */
  async updateSeries(occurrence: Task, next: NewTask, recurrence: string[] | undefined) {
    const series = await this.seriesOf(occurrence);
    if (!series) return;
    const day = startOfDay(series.start);
    const start = next.allDay ? day : withTime(day, next.start.getHours(), next.start.getMinutes());
    const end = next.allDay ? addDays(day, Math.max(1, dayDiff(next.start, next.end))) : new Date(start.getTime() + (next.end.getTime() - next.start.getTime()));
    const { title, description, colorId, label, tags, allDay, reminders } = next;
    this.set({ sync: 'saving' });
    try {
      if (recurrence?.length) {
        await this.store.update(series, { ...series, title, description, colorId, label, tags, allDay, reminders, start, end, recurrence });
      } else {
        await this.store.remove(series.id);
        await this.store.create({ ...next, recurrence: undefined, seriesId: undefined, originalStart: undefined });
      }
      this.set({ sync: 'saved' });
    } catch (e) {
      this.fail(e);
    }
    await this.refresh();
  }

  /**
   * "This and following": the series stops the day before this occurrence, and a new series
   * starts here with the edit (and `recurrence`; none makes it a single task). For the first
   * occurrence that is the same as editing all of them.
   */
  async updateFollowing(occurrence: Task, next: NewTask, recurrence: string[] | undefined) {
    const series = await this.seriesOf(occurrence);
    if (!series?.recurrence) return;
    const at = occurrence.originalStart ?? occurrence.start;
    if (at <= series.start) return this.updateSeries(occurrence, next, recurrence);
    const split = splitRule(series.recurrence, series.start, at, series.allDay);
    // An unchanged rule continues where the old series stops (a COUNT counts what is left).
    const rest = recurrence === series.recurrence || recurrence?.join('\n') === series.recurrence.join('\n') ? split.after : recurrence;
    this.set({ sync: 'saving' });
    try {
      await this.store.update(series, { ...series, recurrence: split.before });
      await this.store.create({ ...next, done: false, recurrence: rest, seriesId: undefined, originalStart: undefined, occurrenceKeys: undefined });
      this.set({ sync: 'saved' });
    } catch (e) {
      this.fail(e);
    }
    await this.refresh();
  }

  /** Deletes this occurrence and the ones after it; undo restores the series' old end. */
  async deleteFollowing(occurrence: Task) {
    const series = await this.seriesOf(occurrence);
    if (!series?.recurrence) return;
    const at = occurrence.originalStart ?? occurrence.start;
    if (at <= series.start) return this.deleteSeries(occurrence);
    const { before } = splitRule(series.recurrence, series.start, at, series.allDay);
    const restore = async () => {
      try {
        const cur = await this.store.getSeries(series.id);
        await this.store.update(cur, { ...cur, recurrence: series.recurrence });
      } catch (e) {
        this.fail(e);
      }
      await this.refresh();
    };
    this.set({ tasks: this.state.tasks.filter((t) => !(t.seriesId === series.id && (t.originalStart ?? t.start) >= at)), sync: 'saving' });
    try {
      await this.store.update(series, { ...series, recurrence: before });
      this.set({ sync: 'saved' });
    } catch (e) {
      this.fail(e);
      return void this.refresh();
    }
    void this.refresh();
    this.toast(tr('rep.deletedFollowing', { title: series.title }), { label: tr('toast.undo'), run: () => void restore() });
  }

  /** Deletes every occurrence of the task's series. Undo brings the series back. */
  async deleteSeries(occurrence: Task) {
    const series = await this.seriesOf(occurrence);
    if (!series) return;
    this.set({ tasks: this.state.tasks.filter((t) => t.seriesId !== series.id && t.id !== series.id), sync: 'saving' });
    try {
      await this.store.remove(series.id);
      this.set({ sync: 'saved' });
    } catch (e) {
      this.fail(e);
      return void this.refresh();
    }
    this.toast(tr('rep.deletedAll', { title: series.title }), {
      label: tr('toast.undo'),
      run: () => void this.create({ ...copyOf(series), recurrence: series.recurrence, extraProps: series.extraProps }),
    });
  }

  /** Shows the task at once under a temporary id and saves it in the background. */
  private startCreate(input: NewTask): { id: string; done: Promise<void> } {
    const tmpId = `tmp-${Date.now().toString(36)}-${++this.tmpSeq}`;
    this.set({ tasks: [...this.state.tasks, { ...input, id: tmpId }] });
    return { id: tmpId, done: this.finishCreate(tmpId, input) };
  }

  private async finishCreate(tmpId: string, input: NewTask): Promise<void> {
    try {
      const { value: real, latest } = await this.enqueue(tmpId, () =>
        this.sendOrHold({ key: tmpId, base: null, next: { ...input, id: tmpId } }, async () => {
          const real = await this.store.create(input);
          this.alias.set(tmpId, real.id);
          this.server.set(real.id, real);
          return real;
        }),
      );
      // Offline: it stays on screen under its temporary id until it's sent.
      if (!real) return;
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
        const base = this.server.get(rid);
        return this.sendOrHold({ key, base: base ?? null, next: { ...next, id: rid } }, () => this.store.update(base ?? { ...next, id: rid }, { ...next, id: rid }));
      });
      if (!real) return;
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
      const { value: sent } = await this.enqueue(key, () => {
        const rid = this.realId(key);
        return this.sendOrHold({ key, base: this.server.get(rid) ?? null, next: null }, async () => {
          await this.store.remove(rid);
          return true;
        });
      });
      if (sent) this.server.delete(this.realId(key));
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

  /** Adds a to-do at the end of the stack. */
  addStackItem(fields: Omit<StackItem, 'id'>) {
    this.setStack([...this.state.stack, { id: this.newStackId(), ...fields }]);
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
