import { queueChange, type Outbox, type Pending } from '../../data/offline';
import { OfflineError } from '../../data/store';
import type { Task } from '../../domain/types';
import { t as tr } from '../../i18n';
import { replaceShown, type SyncHost } from './host';
import type { TaskIds } from './ids';
import type { Inflight } from './inflight';
import type { SaveQueue } from './saveQueue';
import type { ServerTasks } from './serverTasks';

/**
 * Working without a connection: while Google can't be reached, changes wait in an outbox (one
 * merged change per task, kept in this browser) and stay on screen. They're sent once Google
 * answers again (tried now and then, and when the browser says it's back online), or on the
 * next start.
 */
export class OfflineQueue {
  private store: Outbox | null = null;
  private outbox: Pending[] = [];
  /** Set while Google can't be reached: changes go straight to the outbox. */
  private offline = false;
  private flushing = false;
  private retryTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private host: SyncHost,
    private ids: TaskIds,
    private queue: SaveQueue,
    private server: ServerTasks,
    private inflight: Inflight,
  ) {}

  /** The outbox of the calendar in use; what waits in it is sent only for Google (`load`). */
  use(store: Outbox, load: boolean) {
    this.store = store;
    this.outbox = load ? store.load() : [];
    this.host.setUnsent(this.outbox.length);
  }

  get isOffline() {
    return this.offline;
  }

  goOffline() {
    if (!this.offline) this.host.toast(tr('offline.toast'));
    this.offline = true;
    this.host.setSync('offline');
    // `online` events aren't reliable (captive portals, flaky Wi-Fi): also try now and then.
    this.retryTimer ??= setInterval(() => void this.reconnect(), 30_000);
  }

  backOnline() {
    this.offline = false;
    clearInterval(this.retryTimer);
    this.retryTimer = undefined;
    if (this.host.sync() === 'offline') this.host.setSync('');
  }

  /** Google answered: back online, and the outbox is sent. */
  reached() {
    if (this.offline) this.backOnline();
    if (this.outbox.length) void this.flush();
  }

  /** Tries Google again: reloads the days on screen, which sends the outbox if it works. */
  async reconnect() {
    if (this.host.google() && this.offline) await this.host.refresh();
  }

  /**
   * Sends a change, or keeps it in the outbox when offline (or when an earlier change to the
   * same task is still waiting there, so they arrive in order). Null when kept.
   */
  async sendOrHold<T>(change: Pending, send: () => Promise<T>): Promise<T | null> {
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

  private hold(change: Pending) {
    this.outbox = queueChange(this.outbox, change);
    this.store?.save(this.outbox);
    this.host.setUnsent(this.outbox.length);
    this.goOffline();
  }

  /** `tasks` with the outbox's changes applied; `shows` tells what's on screen. */
  overlay(tasks: Task[], shows: (t: Task) => boolean): Task[] {
    let out = tasks;
    for (const p of this.outbox) {
      const ids = [p.key, p.base?.id, p.next?.id];
      out = out.filter((t) => !ids.includes(t.id));
      if (p.next && shows(p.next)) out = [...out, p.next];
    }
    return out;
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
        this.store?.save(this.outbox);
        const settle = this.inflight.expect(p.key, p.next);
        try {
          await this.queue.run(p.key, () => this.send(p));
          sent++;
          settle({ task: p.next && (this.server.get(this.ids.real(p.key)) ?? p.next) });
        } catch (e) {
          settle();
          if (e instanceof OfflineError) {
            this.outbox = queueChange([p, ...this.outbox.filter((q) => q.key !== p.key)], this.outbox.find((q) => q.key === p.key) ?? p);
            this.store?.save(this.outbox);
            this.goOffline();
          } else {
            // Changed or deleted elsewhere meanwhile: that version wins.
            sent++;
            this.host.toast(e instanceof Error ? e.message : tr('err.generic'));
          }
        }
        this.host.setUnsent(this.outbox.length);
      }
    } finally {
      this.flushing = false;
    }
    if (sent) {
      if (!this.outbox.length) this.host.toast(tr('offline.synced'));
      void this.host.refresh();
    }
  }

  private async send({ key, base, next }: Pending) {
    const store = this.host.store();
    const { real } = this.ids;
    if (!next) {
      if (base) await store.remove(real(base.id));
      this.server.delete(real(key));
      return;
    }
    const { id: _, etag: __, ...fields } = next;
    const saved = base ? await store.update(base, { ...next, id: real(base.id) }) : await store.create(fields);
    if (!base) this.ids.link(key, saved.id);
    this.server.set(saved);
    const shown = this.host.tasks().find((t) => t.id === key || t.id === saved.id);
    if (shown) replaceShown(this.host, shown.id, { ...shown, id: saved.id, etag: saved.etag });
  }
}
