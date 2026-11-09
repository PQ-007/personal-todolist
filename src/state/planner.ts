import { useSyncExternalStore } from 'react';
import { createDemoStore } from '../data/demo/demoStore';
import * as googleAuth from '../data/google/auth';
import { createGoogleStore } from '../data/google/googleStore';
import { createOutbox } from '../data/offline';
import { AuthError, OfflineError, type TaskStore } from '../data/store';
import { templates as templateStore, type Template } from '../data/templateStore';
import { copyOf, placeCopy, weekCopies } from '../domain/clipboard';
import { addDays, startOfDay } from '../domain/dates';
import { matchesFilter, type LabelFilter } from '../domain/labels';
import type { StackItem } from '../domain/stack';
import type { NewTask, Task } from '../domain/types';
import { clampSpan, sameRange, stepDay, visibleRange, type View } from '../domain/views';
import { t as tr } from '../i18n';
import { DayLoader, type Auth } from './days';
import type { Mode, PlannerState, StateAccess } from './plannerState';
import { loadFilter, loadMode, loadSettings, loadStackOpen, loadView, saveFilter, saveMode, saveSettings, saveView, type Settings } from './settings';
import { Sync, type SeriesEdit, type SyncHost, type ToastAction } from './sync';
import { TodoStack } from './todoStack';

export type { Template } from '../data/templateStore';
export type { Auth } from './days';
export type { Mode, PlannerState } from './plannerState';
export type { SeriesEdit, SyncState, ToastAction } from './sync';

/** What a planner is built with; each defaults to the real thing. */
export interface PlannerDeps {
  /** The task store for these settings (default: their Google calendar, or the demo calendar). */
  makeStore?: (settings: Settings) => TaskStore;
  /** Settings to start with (default: as saved in this browser). */
  settings?: Settings;
  auth?: Auth;
}

/**
 * Holds what the UI shows and is what the UI talks to. It's made of:
 * - `days` (days.ts): loading the days on screen, at once from the offline copy when it can
 * - `sync` (sync/): saving changes in the background while the screen shows them at once
 * - `todos` (todoStack.ts): the to-do stack
 * and itself keeps the view, navigation, settings and sign-in, and the task actions the UI uses.
 */
export class Planner {
  private state: PlannerState;
  private listeners = new Set<() => void>();
  private demo = createDemoStore();
  private auth: Auth;
  private makeStore: (settings: Settings) => TaskStore;
  private store: TaskStore;
  private sync: Sync;
  private days: DayLoader;
  private todos: TodoStack;
  private toastSeq = 0;

  constructor(deps: PlannerDeps = {}) {
    this.auth = deps.auth ?? googleAuth;
    this.makeStore =
      deps.makeStore ??
      ((s) => (s.mode === 'google' ? createGoogleStore({ calendarId: s.calendarId, getToken: googleAuth.getToken, onUnauthorized: googleAuth.clearToken }) : this.demo));
    this.auth.restoreToken();
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
      settings: deps.settings ?? loadSettings(),
      unsent: 0,
    };
    this.store = this.makeStore(this.state.settings);

    const access: StateAccess = {
      get: () => this.state,
      set: (patch) => this.set(patch),
      toast: (msg, action) => this.toast(msg, action),
      fail: (e) => this.fail(e),
    };
    const host: SyncHost = {
      store: () => this.store,
      google: () => this.google,
      tasks: () => this.state.tasks,
      setTasks: (tasks) => this.set({ tasks }),
      range: () => this.state.range,
      withUnsent: (tasks) => this.sync.overlay(tasks),
      sync: () => this.state.sync,
      setSync: (sync) => this.set({ sync }),
      setUnsent: (unsent) => this.set({ unsent }),
      toast: access.toast,
      fail: access.fail,
      refresh: () => this.refresh(),
      loading: () => this.days.loading(),
      loadSeq: () => this.days.loadSeq(),
    };
    this.sync = new Sync(host);
    this.days = new DayLoader(access, this.sync, this.auth, () => this.store);
    this.todos = new TodoStack(access, {
      find: (id) => this.find(id),
      add: (task) => this.sync.tasks.create(task).id,
      remove: (id) => void this.remove(id),
      tasksIn: (from, days) => this.days.tasksIn(from, days),
    });

    this.useCalendar();
    this.todos.load(this.state.settings.mode);
    globalThis.addEventListener?.('online', () => void this.sync.offline.reconnect());
    globalThis.document?.addEventListener('visibilitychange', () => this.onVisibility());
    // Back from a sign-in that Google or the auth function turned down.
    const authError = new URLSearchParams(location.search).get('auth');
    if (authError) {
      history.replaceState(null, '', location.pathname);
      this.toast(tr(authError === 'scope' ? 'err.scope' : 'err.signIn'));
    }
  }

  private get google() {
    return this.state.settings.mode === 'google';
  }

  /** The offline copy and outbox of the calendar in the settings. */
  private useCalendar() {
    const cal = this.state.settings.calendarId || 'primary';
    this.days.useCalendar(cal);
    this.sync.useOutbox(createOutbox(cal), this.google);
  }

  /* ---------- state ---------- */

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  get = () => this.state;
  private set(patch: Partial<PlannerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** Resolves once nothing is loading or being saved. */
  async idle(): Promise<void> {
    const work = () => [this.days.loading(), ...this.sync.busy()];
    for (let i = 0; i < 100; i++) {
      const now = work();
      await Promise.allSettled(now);
      const after = work();
      if (after.length === now.length && after.every((p, j) => p === now[j])) return;
    }
  }

  toast(msg: string, action?: ToastAction) {
    this.set({ toast: { id: ++this.toastSeq, msg, action } });
  }
  dismissToast() {
    this.set({ toast: null });
  }

  private fail(err: unknown) {
    if (err instanceof AuthError) this.set({ needAuth: true });
    if (err instanceof OfflineError) this.sync.offline.goOffline();
    this.set({ sync: err instanceof OfflineError ? 'offline' : 'error' });
    this.toast(err instanceof Error ? err.message : tr('err.generic'));
  }

  /* ---------- loading (see DayLoader) ---------- */

  /** Loads the days on screen. Resolves once they are loaded, by this load or a newer one. */
  refresh(): Promise<void> {
    return this.days.refresh();
  }
  peek(from: Date, to: Date): Promise<Task[]> {
    return this.days.peek(from, to);
  }
  search(query: string): Promise<Task[]> {
    return this.days.search(query);
  }

  /** Leaving the tab keeps the offline copy current; coming back shows changes made elsewhere meanwhile. */
  private onVisibility() {
    if (document.visibilityState === 'hidden') return this.days.leaving();
    if (!this.state.needAuth) void this.refresh();
  }

  /* ---------- navigation ---------- */

  /** Applies a new view, day or span, loading the days on screen when they change. */
  private navigate(patch: Partial<Pick<PlannerState, 'view' | 'day' | 'span'>>) {
    const next = { view: this.state.view, day: this.state.day, span: this.state.span, ...patch };
    next.day = startOfDay(next.day);
    next.span = clampSpan(next.span);
    const range = visibleRange(next);
    const moved = !sameRange(range, this.state.range);
    if (moved) this.days.leaving();
    if (patch.view || patch.span) saveView({ view: next.view, span: next.span });
    this.set({ ...next, range });
    if (moved) void this.refresh();
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

  /** Loads Google's sign-in script ahead of time, so the sign-in popup can open straight from a click. */
  prepareSignIn() {
    this.auth.loadGis().catch(() => {});
  }

  async connect() {
    try {
      await this.auth.signIn(this.state.settings.clientId);
      await this.refresh();
    } catch (e) {
      this.toast(e instanceof Error ? e.message : tr('err.signIn'));
    }
  }

  async disconnect() {
    await this.auth.signOut();
    this.forget();
    this.set({ needAuth: true, tasks: [] });
  }

  /** Drops what's known about the calendar's tasks (another calendar, or signed out). */
  private forget() {
    this.sync.forget();
    this.days.forget();
  }

  async applySettings(settings: Settings) {
    saveSettings(settings);
    this.set({ settings, tasks: [] });
    this.forget();
    this.store = this.makeStore(settings);
    this.todos.load(settings.mode);
    this.useCalendar();
    this.sync.offline.backOnline();
    if (settings.mode === 'google' && !(await this.auth.ensureToken())) await this.connect();
    else await this.refresh();
  }

  resetDemo() {
    this.demo.reset();
    this.toast(tr('set.demoReset'));
    if (!this.google) void this.refresh();
  }

  /* ---------- tasks ---------- */

  find = (id: string) => this.state.tasks.find((t) => t.id === this.sync.ids.real(id));

  create(input: NewTask): Promise<void> {
    return input.recurrence?.length ? this.sync.series.create(input) : this.sync.tasks.create(input).done;
  }
  update(next: Task): Promise<void> {
    return this.sync.tasks.update(next);
  }
  remove(id: string): Promise<void> {
    return this.sync.tasks.remove(id);
  }

  patch(id: string, patch: Partial<Task>) {
    const t = this.find(id);
    if (t) return this.update({ ...t, ...patch });
  }

  toggleDone(id: string) {
    const t = this.find(id);
    if (t) return this.update({ ...t, done: !t.done });
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

  /** Pastes the copied task on `day`, at `time` if given (see `placeCopy`). */
  paste(day: Date, time?: Date) {
    const c = this.state.clipboard;
    if (c) void this.create(placeCopy(c, day, time));
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
      source = await this.days.tasksIn(from, days);
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
    const ids = copies.map((c) => this.sync.tasks.create(c).id);
    this.toast(tr('toast.weekCopied', { n: copies.length }), {
      label: tr('toast.undo'),
      run: () => ids.forEach((id) => void this.remove(id)),
    });
  }

  /* ---------- repeating tasks (see sync/seriesSync.ts) ---------- */

  seriesOf(task: Task): Promise<Task | null> {
    return this.sync.series.seriesOf(task);
  }
  startRepeating(next: Task): Promise<void> {
    return this.sync.series.startRepeating(next);
  }
  updateSeries(occurrence: Task, edit: SeriesEdit): Promise<void> {
    return this.sync.series.updateSeries(occurrence, edit);
  }
  updateFollowing(occurrence: Task, edit: SeriesEdit): Promise<void> {
    return this.sync.series.updateFollowing(occurrence, edit);
  }
  deleteFollowing(occurrence: Task): Promise<void> {
    return this.sync.series.deleteFollowing(occurrence);
  }
  deleteSeries(occurrence: Task): Promise<void> {
    return this.sync.series.deleteSeries(occurrence);
  }

  /* ---------- templates (saved in this browser, see data/templateStore.ts) ---------- */

  listTemplates = (): Template[] => templateStore.load();
  /** Saves a template, replacing one with the same name. */
  addTemplate(template: Omit<Template, 'id'>) {
    templateStore.add(template);
  }
  removeTemplate(id: string) {
    templateStore.remove(id);
  }

  /* ---------- to-do stack (see TodoStack) ---------- */

  setStackOpen(open: boolean) {
    this.todos.setOpen(open);
  }
  addStackItem(fields: Omit<StackItem, 'id'>) {
    this.todos.add(fields);
  }
  updateStackItem(id: string, patch: Partial<Omit<StackItem, 'id'>>) {
    this.todos.update(id, patch);
  }
  moveStackItem(id: string, index: number) {
    this.todos.move(id, index);
  }
  deleteStackItem(id: string) {
    this.todos.delete(id);
  }
  scheduleItem(id: string, start: Date, allDay = false) {
    this.todos.schedule(id, start, allDay);
  }
  scheduleItemOn(id: string, day: Date): Promise<void> {
    return this.todos.scheduleOn(id, day);
  }
  unschedule(taskId: string) {
    this.todos.unschedule(taskId);
  }
}

export const planner = new Planner();
export const usePlanner = () => useSyncExternalStore(planner.subscribe, planner.get);
