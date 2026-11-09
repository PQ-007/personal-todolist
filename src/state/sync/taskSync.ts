import { ConflictError } from '../../data/store';
import type { NewTask, Task } from '../../domain/types';
import { replaceShown, type SyncHost } from './host';
import type { TaskIds } from './ids';
import type { Inflight } from './inflight';
import type { OfflineQueue } from './offlineQueue';
import type { SaveQueue } from './saveQueue';
import type { ServerTasks } from './serverTasks';

/**
 * Creates, changes and deletes single tasks optimistically: the screen changes at once, the
 * store call runs in the background (after earlier ones to the same task, diffed against the
 * last version the server confirmed), and a failure rolls that task back with a toast.
 * Offline, the change waits in the outbox instead (see `OfflineQueue`).
 */
export class TaskSync {
  constructor(
    private host: SyncHost,
    private ids: TaskIds,
    private queue: SaveQueue,
    private server: ServerTasks,
    private inflight: Inflight,
    private offline: OfflineQueue,
  ) {}

  /** Shows the task at once under a temporary id and saves it in the background. */
  create(input: NewTask): { id: string; done: Promise<void> } {
    const tmpId = this.ids.temp();
    this.host.setTasks([...this.host.tasks(), { ...input, id: tmpId }]);
    return { id: tmpId, done: this.finishCreate(tmpId, input) };
  }

  private async finishCreate(tmpId: string, input: NewTask): Promise<void> {
    const settle = this.inflight.expect(tmpId, { ...input, id: tmpId });
    try {
      const { value: real, latest } = await this.queue.run(tmpId, () =>
        this.offline.sendOrHold({ key: tmpId, base: null, next: { ...input, id: tmpId } }, async () => {
          const real = await this.host.store().create(input);
          this.ids.link(tmpId, real.id);
          this.server.set(real);
          return real;
        }),
      );
      // Offline: it stays on screen under its temporary id until it's sent (the outbox shows it).
      settle(real ? { task: real } : undefined);
      if (!real) return;
      const cur = this.host.tasks().find((t) => t.id === tmpId || t.id === real.id);
      // If the task was edited while being created, keep those edits (they are queued).
      if (cur) replaceShown(this.host, cur.id, latest ? real : { ...cur, id: real.id, etag: real.etag });
    } catch (e) {
      settle();
      replaceShown(this.host, tmpId, null);
      this.host.fail(e);
    }
  }

  async update(next: Task): Promise<void> {
    const { real: realId, keyOf } = this.ids;
    const id = realId(next.id);
    replaceShown(this.host, id, { ...next, id });
    const key = keyOf(id);
    const settle = this.inflight.expect(key, { ...next, id });
    try {
      const { value: real, latest } = await this.queue.run(key, async () => {
        await this.server.fresh(realId(key));
        const rid = realId(key);
        const base = this.server.get(rid);
        return this.offline.sendOrHold({ key, base: base ?? null, next: { ...next, id: rid } }, () =>
          this.host.store().update(base ?? { ...next, id: rid }, { ...next, id: rid }),
        );
      });
      settle(real ? { task: real } : undefined);
      if (!real) return;
      this.server.set(real);
      if (latest) replaceShown(this.host, realId(id), real);
    } catch (e) {
      settle();
      const rid = realId(id);
      const known = this.server.get(rid);
      if (known) replaceShown(this.host, rid, known);
      this.host.fail(e);
      if (e instanceof ConflictError) void this.host.refresh();
    }
  }

  async remove(id0: string): Promise<void> {
    const { real: realId, keyOf } = this.ids;
    const id = realId(id0);
    const before = this.host.tasks().find((t) => t.id === id);
    if (!before) return;
    replaceShown(this.host, id, null);
    const key = keyOf(id);
    const settle = this.inflight.expect(key, null);
    try {
      const { value: sent } = await this.queue.run(key, async () => {
        await this.server.fresh(realId(key));
        const rid = realId(key);
        return this.offline.sendOrHold({ key, base: this.server.get(rid) ?? null, next: null }, async () => {
          await this.host.store().remove(rid);
          return true;
        });
      });
      settle(sent ? { task: null } : undefined);
      if (sent) this.server.delete(realId(key));
    } catch (e) {
      settle();
      const rid = realId(key);
      this.host.setTasks([...this.host.tasks(), this.server.get(rid) ?? { ...before, id: rid }]);
      this.host.fail(e);
    }
  }
}
