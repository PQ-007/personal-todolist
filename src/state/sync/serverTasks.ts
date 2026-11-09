import type { Task } from '../../domain/types';

/**
 * The last version of each task the server confirmed: what changes are diffed against (only
 * changed fields are sent, and the etag guards against edits made elsewhere).
 */
export class ServerTasks {
  private tasks = new Map<string, Task>();
  /** Known only from the offline copy: changes to them wait for a fresh load first. */
  private stale = new Set<string>();

  /** @param loading the latest load of the days on screen. */
  constructor(private loading: () => Promise<void>) {}

  /** A fresh load of the days on screen: what the server has now. */
  loaded(tasks: Task[]) {
    this.tasks = new Map(tasks.map((t) => [t.id, t]));
    this.stale.clear();
  }

  /** The offline copy, shown while offline: taken as what the server has. */
  loadedOffline(tasks: Task[]) {
    this.tasks = new Map(tasks.map((t) => [t.id, t]));
  }

  /** The offline copy, shown while a fresh load runs: tasks it adds count, but as stale (see `fresh`). */
  loadedCached(tasks: Task[]) {
    for (const t of tasks) {
      if (this.tasks.has(t.id)) continue;
      this.tasks.set(t.id, t);
      this.stale.add(t.id);
    }
  }

  all = (): Task[] => [...this.tasks.values()];
  get = (id: string) => this.tasks.get(id);
  set(task: Task) {
    this.tasks.set(task.id, task);
  }
  delete(id: string) {
    this.tasks.delete(id);
  }

  forget() {
    this.tasks.clear();
    this.stale.clear();
  }

  /** Waits for the fresh load when `id` is only known from the offline copy (its version may be old). */
  async fresh(id: string) {
    if (this.stale.has(id)) await this.loading();
  }
}
