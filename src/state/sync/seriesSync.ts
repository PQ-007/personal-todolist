import { OfflineError } from '../../data/store';
import { copyOf } from '../../domain/clipboard';
import { addDays, dayDiff } from '../../domain/dates';
import { previewOccurrences, splitRule } from '../../domain/recurrence';
import type { NewTask, Task } from '../../domain/types';
import { t as tr } from '../../i18n';
import type { SyncHost } from './host';
import type { TaskIds } from './ids';
import type { OfflineQueue } from './offlineQueue';
import type { SaveQueue } from './saveQueue';
import { contentOf, contentOnly, editSeries, plainTask, splitSeries, type SeriesEdit } from './seriesEdit';
import type { ServerTasks } from './serverTasks';
import type { TaskSync } from './taskSync';

/**
 * Saves changes to repeating tasks beyond one occurrence (all of them, this and following)
 * without waiting for them: the days on screen show what the change will leave, worked out
 * here from the rule, until it's saved and the days are reloaded. Changes to one occurrence
 * are single-task changes (`TaskSync`).
 *
 * These changes need Google (they aren't kept in the outbox), so they're refused offline.
 */
export class SeriesSync {
  /** Series as last fetched, or as a change being saved will leave them: what previews are made from. */
  private cache = new Map<string, Task>();
  /** Series changes are saved one at a time, each after the reload that follows the one before. */
  private chain: Promise<void> = Promise.resolve();
  /** How each series change being saved changes the days on screen, kept on top of reloads until saved. */
  private views = new Set<(tasks: Task[]) => Task[]>();

  constructor(
    private host: SyncHost,
    private ids: TaskIds,
    private queue: SaveQueue,
    private server: ServerTasks,
    private offline: OfflineQueue,
    private tasks: TaskSync,
  ) {}

  /** `tasks` with the series changes being saved applied on top. */
  overlay(tasks: Task[]): Task[] {
    let out = tasks;
    for (const view of this.views) out = view(out);
    return out;
  }

  /** The series change being saved last, for `Planner.idle`. */
  saving = () => this.chain;

  forget() {
    this.cache.clear();
  }

  /* ---------- series ---------- */

  /**
   * The series a task belongs to: itself when it is one, its series for an occurrence, else
   * null. Answers at once when the series is known here (see `cache`), fetching it again in
   * the background; saving always fetches it fresh, so this is only for showing and previews.
   */
  async seriesOf(task: Task): Promise<Task | null> {
    if (task.recurrence?.length) return task;
    if (!task.seriesId) return null;
    const id = this.ids.real(task.seriesId);
    const cached = this.cache.get(id);
    // A series still being created is only known here.
    if (id.startsWith('tmp-')) return cached ?? null;
    if (cached) {
      // Not while a change is being saved: the server still has the series as it was.
      if (!this.views.size) void this.fetch(id).catch(() => {});
      return cached;
    }
    try {
      return await this.fetch(id);
    } catch (e) {
      this.host.fail(e);
      return null;
    }
  }

  private async fetch(id: string): Promise<Task> {
    const series = await this.host.store().getSeries(this.ids.real(id));
    this.cache.set(series.id, series);
    return series;
  }

  /** Whether a task is series `id` or one of its occurrences. */
  private inSeries(id: string) {
    const { real: realId } = this.ids;
    const sid = realId(id);
    return (t: Task) => realId(t.id) === sid || (!!t.seriesId && realId(t.seriesId) === sid);
  }

  /** `tasks` with the ones `replaced` swapped for `series` (its occurrences on screen, or itself when it doesn't repeat). */
  private seriesView(tasks: Task[], replaced: (t: Task) => boolean, series: Task | null, shiftDays = 0): Task[] {
    const rest = tasks.filter((t) => !replaced(t) && t.id !== series?.id);
    if (!series) return rest;
    if (!series.recurrence?.length) return [...rest, series];
    const { from, days } = this.host.range();
    return [...rest, ...previewOccurrences(series, tasks.filter(replaced), from, addDays(from, days), shiftDays)];
  }

  /**
   * Saves a change to a series without waiting for it: `view` shows the days on screen as the
   * change will leave them, at once and on top of every reload until it's saved. Then `write`
   * runs (after earlier series changes) and the days are reloaded. Edits to tasks that only the
   * preview has wait for that, and then go to the occurrence the calendar made in their place.
   */
  private change(view: (tasks: Task[]) => Task[], write: () => Promise<void>): Promise<void> {
    const before = new Set(this.host.tasks());
    this.views.add(view);
    this.queue.begin();
    this.host.setTasks(view(this.host.tasks()));
    const previews = this.host.tasks().filter((t) => !before.has(t));
    const job = this.chain.then(async () => {
      let failed = false;
      try {
        await write();
      } catch (e) {
        failed = true;
        // Previews may have been built on what failed.
        this.cache.clear();
        this.host.fail(e);
        // Series changes aren't kept for later (see `refuseOffline`): it didn't happen.
        if (e instanceof OfflineError) this.host.toast(tr('rep.offline'));
      }
      this.queue.end(failed);
      this.views.delete(view);
      // Back to what's known at once, whether or not the reload below can reach Google.
      if (failed) this.host.setTasks(this.host.withUnsent(this.server.all().filter((t) => !t.recurrence?.length)));
      await this.host.refresh();
      this.adopt(previews);
    });
    this.chain = job;
    for (const t of previews) this.queue.after(t.id, job);
    return job;
  }

  /** Points each preview at the occurrence the calendar made in its place (same series, first due at the same time). */
  private adopt(previews: Task[]) {
    const { real: realId } = this.ids;
    const loaded = this.server.all();
    for (const p of previews) {
      if (this.server.get(realId(p.id)) || !p.seriesId || !p.originalStart) continue;
      const sid = realId(p.seriesId);
      const at = p.originalStart.getTime();
      const real = loaded.find((t) => t.seriesId === sid && t.originalStart?.getTime() === at);
      if (real) this.ids.link(p.id, real.id);
    }
  }

  /** True, with a toast, when Google can't be reached (these changes aren't kept for later). */
  private refuseOffline(): boolean {
    if (!this.offline.isOffline) return false;
    this.host.toast(tr('rep.offline'));
    return true;
  }

  /* ---------- changes ---------- */

  /** Creates a series: its occurrences show at once; the real ones replace them once it's saved. */
  create(input: NewTask): Promise<void> {
    const { id, done } = this.tasks.create(input);
    const series = { ...input, id };
    this.cache.set(id, series);
    return this.change(
      (tasks) => this.seriesView(tasks, this.inSeries(id), series),
      async () => {
        await done;
        // Known under its real id too, so changing it next shows at once.
        const real = this.ids.real(id);
        if (real !== id) this.cache.set(real, { ...series, id: real });
      },
    );
  }

  /** Makes a single task repeat (`next` carries the rule), showing its occurrences at once. */
  startRepeating(next: Task): Promise<void> {
    const id = this.ids.real(next.id);
    const done = this.tasks.update(next);
    const series = { ...next, id };
    this.cache.set(id, series);
    return this.change(
      (tasks) => this.seriesView(tasks, this.inSeries(id), series),
      () => done,
    );
  }

  /** "All of them" (see `editSeries`): without a rule the series becomes a single task. */
  async updateSeries(occurrence: Task, edit: SeriesEdit): Promise<void> {
    if (this.refuseOffline()) return;
    const known = await this.seriesOf(occurrence);
    if (!known) return;
    const { series, next } = editSeries(known, occurrence, edit);
    const plain = series ? null : { ...plainTask(next), id: this.ids.temp() };
    if (series) this.cache.set(series.id, series);
    const shift = dayDiff(occurrence.start, next.start);
    const ofSeries = this.inSeries(known.id);
    // Only content changed: the occurrences on screen take it as they are, so ones moved or
    // deleted on their own stay that way (a rebuild from the rule would undo that until reloaded).
    const view =
      series && contentOnly(known, series)
        ? (tasks: Task[]) => tasks.map((t) => (t.seriesId && ofSeries(t) ? { ...t, ...contentOf(series) } : t))
        : (tasks: Task[]) => this.seriesView(tasks, ofSeries, series ?? plain, shift);
    return this.change(view, async () => {
      const store = this.host.store();
      const cur = await this.fetch(known.id);
      const { series: saved, next: fields } = editSeries(cur, occurrence, edit);
      if (saved) {
        this.cache.set(cur.id, await store.update(cur, saved));
        return;
      }
      await store.remove(cur.id);
      this.cache.delete(cur.id);
      const real = await store.create(plainTask(fields));
      this.server.set(real);
      if (plain) this.ids.link(plain.id, real.id);
    });
  }

  /** "This and following" (see `splitSeries`). For the first occurrence that is "all of them". */
  async updateFollowing(occurrence: Task, edit: SeriesEdit): Promise<void> {
    if (this.refuseOffline()) return;
    const known = await this.seriesOf(occurrence);
    if (!known?.recurrence) return;
    const at = occurrence.originalStart ?? occurrence.start;
    if (at <= known.start) return this.updateSeries(occurrence, edit);
    const { before, rest } = splitSeries(known, occurrence, edit);
    const created = { ...rest, id: this.ids.temp() };
    this.cache.set(known.id, { ...known, recurrence: before });
    this.cache.set(created.id, created);
    const later = (t: Task) => this.inSeries(known.id)(t) && (t.originalStart ?? t.start) >= at;
    return this.change(
      (tasks) => this.seriesView(tasks, later, created, dayDiff(occurrence.start, rest.start)),
      async () => {
        const store = this.host.store();
        const cur = await this.fetch(known.id);
        if (!cur.recurrence) return;
        const split = splitSeries(cur, occurrence, edit);
        this.cache.set(cur.id, await store.update(cur, { ...cur, recurrence: split.before }));
        const real = await store.create(split.rest);
        this.ids.link(created.id, real.id);
        this.cache.delete(created.id);
        if (real.recurrence?.length) this.cache.set(real.id, real);
        else this.server.set(real);
      },
    );
  }

  /** Deletes this occurrence and the ones after it, at once; undo restores the series' old end. */
  deleteFollowing(occurrence: Task): Promise<void> {
    if (this.refuseOffline()) return Promise.resolve();
    const sid = occurrence.seriesId ?? occurrence.id;
    const at = occurrence.originalStart ?? occurrence.start;
    const later = (t: Task) => this.inSeries(sid)(t) && (t.originalStart ?? t.start) >= at;
    const shown = this.host.tasks().filter(later);
    let restore: (() => Promise<void>) | null = null;
    const job = this.change(
      (tasks) => tasks.filter((t) => !later(t)),
      async () => {
        const store = this.host.store();
        const series = await this.fetch(sid);
        if (!series.recurrence) return;
        if (at <= series.start) {
          await store.remove(series.id);
          this.cache.delete(series.id);
          restore = () => this.recreate(series);
          return;
        }
        const { before } = splitRule(series.recurrence, series.start, at, series.allDay);
        this.cache.set(series.id, await store.update(series, { ...series, recurrence: before }));
        restore = async () => {
          const cur = await this.fetch(series.id);
          this.cache.set(cur.id, await this.host.store().update(cur, { ...cur, recurrence: series.recurrence }));
        };
      },
    );
    this.host.toast(tr('rep.deletedFollowing', { title: occurrence.title }), {
      label: tr('toast.undo'),
      run: () => this.undoDelete(shown, async () => restore?.()),
    });
    return job;
  }

  /** Deletes every occurrence of the task's series, at once. Undo brings the series back. */
  deleteSeries(occurrence: Task): Promise<void> {
    if (this.refuseOffline()) return Promise.resolve();
    const sid = occurrence.seriesId ?? occurrence.id;
    const shown = this.host.tasks().filter(this.inSeries(sid));
    let removed: Task | null = null;
    const job = this.change(
      (tasks) => tasks.filter((t) => !this.inSeries(sid)(t)),
      async () => {
        const series = await this.fetch(sid);
        await this.host.store().remove(series.id);
        this.cache.delete(series.id);
        removed = series;
      },
    );
    this.host.toast(tr('rep.deletedAll', { title: occurrence.title }), {
      label: tr('toast.undo'),
      run: () =>
        this.undoDelete(shown, async () => {
          const s = removed as Task | null;
          if (s) await this.recreate(s);
        }),
    });
    return job;
  }

  /**
   * Undoes a series deletion: the occurrences it took off the screen come back at once, and
   * `restore` puts the series back once the deletion is saved (it does nothing if that failed).
   */
  private undoDelete(shown: Task[], restore: () => Promise<void>) {
    if (this.refuseOffline()) return;
    const ids = new Set(shown.map((t) => t.id));
    void this.change((tasks) => [...tasks.filter((t) => !ids.has(t.id)), ...shown], restore);
  }

  /** Creates a deleted series again. Its old id points to the new one, so edits to occurrences shown meanwhile find theirs. */
  private async recreate(series: Task) {
    const real = await this.host.store().create({ ...copyOf(series), recurrence: series.recurrence, extraProps: series.extraProps });
    this.ids.link(series.id, real.id);
    this.cache.set(real.id, real);
  }
}
