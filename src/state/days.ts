import { createTaskCache, type TaskCache } from '../data/offline';
import { OfflineError, type TaskStore } from '../data/store';
import type * as googleAuth from '../data/google/auth';
import { addDays } from '../domain/dates';
import type { Task } from '../domain/types';
import { sameRange, type DayRange } from '../domain/views';
import type { StateAccess } from './plannerState';
import type { Sync } from './sync';

/** Signing in to Google (see google/auth.ts). */
export type Auth = Pick<typeof googleAuth, 'restoreToken' | 'ensureToken' | 'authUnreachable' | 'loadGis' | 'signIn' | 'signOut'>;

/**
 * Loads the tasks of the days on screen. Days loaded before show at once from the offline copy
 * (kept in this browser, current with what was saved since) until Google answers, and while
 * offline. Loads can overlap; only the latest one is shown.
 */
export class DayLoader {
  private seq = 0;
  private latest: Promise<void> = Promise.resolve();
  /** The range the tasks on screen were loaded for (null: none yet). */
  private shownRange: DayRange | null = null;
  private cache!: TaskCache;

  constructor(
    private state: StateAccess,
    private sync: Sync,
    private auth: Auth,
    private store: () => TaskStore,
  ) {}

  private get google() {
    return this.state.get().settings.mode === 'google';
  }

  /** The offline copy of calendar `id`. */
  useCalendar(id: string) {
    this.cache = createTaskCache(id);
  }

  /** The latest load. */
  loading = () => this.latest;
  /** How many loads have started. */
  loadSeq = () => this.seq;

  /** Forgets what's on screen (another calendar, or signed out). */
  forget() {
    this.shownRange = null;
  }

  /** Loads the days on screen. Resolves once they are loaded, by this load or a newer one. */
  refresh(): Promise<void> {
    return (this.latest = this.load());
  }

  private async load(): Promise<void> {
    const seq = ++this.seq;
    const google = this.google;
    const range = this.state.get().range;
    // New days show at once as last loaded, until Google answers.
    if (google && !(this.shownRange && sameRange(this.shownRange, range))) this.showCached();
    if (google && !(await this.auth.ensureToken())) {
      if (seq !== this.seq) return this.latest;
      if (this.auth.authUnreachable()) return this.showOffline();
      this.sync.server.forget();
      this.shownRange = null;
      this.state.set({ needAuth: true, tasks: [] });
      return;
    }
    this.state.set({ needAuth: false, sync: 'loading' });
    const { from, days } = this.state.get().range;
    try {
      const tasks = await this.store().list(from, addDays(from, days));
      if (seq !== this.seq) return this.latest;
      if (google) this.cache.put(from, days, tasks);
      this.sync.loaded(tasks, seq);
      this.shownRange = { from, days };
      this.state.set({ tasks: this.sync.overlay(tasks), sync: '' });
      this.sync.offline.reached();
    } catch (e) {
      if (seq !== this.seq) return this.latest;
      if (e instanceof OfflineError) this.showOffline();
      else this.state.fail(e);
    }
  }

  /** The days on screen as last loaded, with the changes still waiting to be sent. */
  private showOffline() {
    const { from, days } = this.state.get().range;
    const cached = this.cache.get(from, days);
    if (cached) this.sync.server.loadedOffline(cached);
    this.state.set({ needAuth: false, tasks: this.sync.overlay(cached ?? this.state.get().tasks) });
    this.sync.offline.goOffline();
  }

  /** Shows the days on screen from the offline copy while they load. */
  private showCached() {
    const { from, days } = this.state.get().range;
    const cached = this.cache.get(from, days);
    if (!cached) return;
    this.sync.server.loadedCached(cached);
    this.shownRange = { from, days };
    this.state.set({ tasks: this.sync.overlay(cached) });
  }

  /**
   * The days on screen are about to be left (another range, or the tab is hidden): their
   * offline copy takes the changes saved since they loaded, so they show as they are when
   * shown from it again.
   */
  leaving() {
    const r = this.shownRange;
    if (!r || !this.google || !sameRange(r, this.state.get().range)) return;
    const to = addDays(r.from, r.days);
    // What Google has confirmed: changes still being sent are shown on top anyway.
    const tasks = this.sync.server.all().filter((t) => !t.recurrence?.length && t.end > r.from && t.start < to);
    this.cache.put(r.from, r.days, tasks);
  }

  /**
   * Tasks in days that aren't on screen, from the offline copy when it has them (kept current
   * by `leaving`), else loaded. For actions that shouldn't wait on Google, not for showing.
   */
  async tasksIn(from: Date, days: number): Promise<Task[]> {
    const cached = this.google ? this.cache.get(from, days) : null;
    return cached ?? this.store().list(from, addDays(from, days));
  }

  /**
   * Tasks in any range, for overviews such as the mini calendar's busy days. Unlike `refresh`
   * it changes nothing on screen, and a failure just returns nothing (no toast).
   */
  async peek(from: Date, to: Date): Promise<Task[]> {
    if (this.google && !(await this.auth.ensureToken())) return [];
    try {
      return await this.store().list(from, to);
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
    if (this.google && !(await this.auth.ensureToken())) return [];
    let found: Task[];
    try {
      found = await this.store().search(query, addDays(now, -365), addDays(now, 365));
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
}
