import type { SyncState } from './host';

/**
 * Runs the saves to each task one after another (so rapid edits never race), and keeps the
 * saving/saved status: "saving" while any save runs, "saved" once none is left.
 */
export class SaveQueue {
  /** Per-task queue of saves, by queue key (see `TaskIds.keyOf`). */
  private chains = new Map<string, Promise<unknown>>();
  /** Saves in progress. */
  private pending = 0;

  constructor(private status: { sync(): SyncState; setSync(sync: SyncState): void }) {}

  /** Runs `job` after earlier jobs for the same task; `latest` tells whether nothing newer was queued. */
  async run<T>(key: string, job: () => Promise<T>): Promise<{ value: T; latest: boolean }> {
    const run = (this.chains.get(key) ?? Promise.resolve()).catch(() => {}).then(job);
    this.chains.set(key, run);
    this.begin();
    try {
      const value = await run;
      return { value, latest: this.chains.get(key) === run };
    } finally {
      if (this.chains.get(key) === run) this.chains.delete(key);
      this.end();
    }
  }

  /** Saves to task `key` wait for `job` from now on (after anything already queued for it). */
  after(key: string, job: Promise<unknown>) {
    const gate = Promise.all([this.chains.get(key)?.catch(() => {}), job]);
    this.chains.set(key, gate);
    void gate.then(() => this.chains.get(key) === gate && this.chains.delete(key));
  }

  /** What's still queued. */
  queued = (): Promise<unknown>[] => [...this.chains.values()];

  /** A save starts. */
  begin() {
    this.pending++;
    this.status.setSync('saving');
  }

  /** A save ends; "saved" once none is left, unless it failed (the error shows instead). */
  end(failed = false) {
    if (--this.pending === 0 && !failed && this.status.sync() === 'saving') this.status.setSync('saved');
  }
}
