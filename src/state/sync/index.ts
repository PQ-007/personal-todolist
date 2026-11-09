import type { Outbox } from '../../data/offline';
import type { Task } from '../../domain/types';
import { showsIn, type SyncHost } from './host';
import { TaskIds } from './ids';
import { Inflight } from './inflight';
import { OfflineQueue } from './offlineQueue';
import { SaveQueue } from './saveQueue';
import { SeriesSync } from './seriesSync';
import { ServerTasks } from './serverTasks';
import { TaskSync } from './taskSync';

export type { SeriesEdit } from './seriesEdit';
export type { SyncHost, SyncState, ToastAction } from './host';

/**
 * Saving changes without waiting for them, put together:
 * - `ids` (ids.ts): temporary and replaced ids, and where they point now
 * - `queue` (saveQueue.ts): saves to each task in order, and the saving/saved status
 * - `server` (serverTasks.ts): the versions the server confirmed, which changes are diffed against
 * - `inflight` (inflight.ts): changes still being sent, kept on screen through reloads
 * - `offline` (offlineQueue.ts): the outbox, and being offline
 * - `tasks` (taskSync.ts): creating, changing and deleting single tasks
 * - `series` (seriesSync.ts): changing repeating tasks beyond one occurrence
 */
export class Sync {
  readonly ids = new TaskIds();
  readonly queue: SaveQueue;
  readonly server: ServerTasks;
  readonly inflight: Inflight;
  readonly offline: OfflineQueue;
  readonly tasks: TaskSync;
  readonly series: SeriesSync;

  constructor(private host: SyncHost) {
    this.queue = new SaveQueue(host);
    this.server = new ServerTasks(host.loading);
    this.inflight = new Inflight(this.ids, host.loadSeq);
    this.offline = new OfflineQueue(host, this.ids, this.queue, this.server, this.inflight);
    this.tasks = new TaskSync(host, this.ids, this.queue, this.server, this.inflight, this.offline);
    this.series = new SeriesSync(host, this.ids, this.queue, this.server, this.offline, this.tasks);
  }

  /** The calendar in use changed: its outbox (sent only for Google, `load`). */
  useOutbox(store: Outbox, load: boolean) {
    this.offline.use(store, load);
  }

  /** `tasks` as loaded, with everything still being saved shown on top: the outbox, changes being sent, series changes. */
  overlay(tasks: Task[]): Task[] {
    const shows = showsIn(this.host);
    return this.series.overlay(this.inflight.overlay(this.offline.overlay(tasks, shows), shows));
  }

  /** A fresh load (number `seq`) of the days on screen: what the server has now. */
  loaded(tasks: Task[], seq: number) {
    this.server.loaded(tasks);
    this.inflight.loaded(seq);
  }

  /** Forgets every task (another calendar, or signed out). */
  forget() {
    this.server.forget();
    this.inflight.forget();
    this.series.forget();
  }

  /** What's still being saved. */
  busy = (): Promise<unknown>[] => [this.series.saving(), ...this.queue.queued()];
}
