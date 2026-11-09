import type { Task } from '../../domain/types';
import type { TaskIds } from './ids';

/**
 * What each task with a change still being sent should look like (null: deleted), kept on top
 * of reloads so a reload that overlaps the change doesn't undo it on screen.
 */
export class Inflight {
  /** By queue key (see `TaskIds.keyOf`). */
  private changes = new Map<string, { task: Task | null; token: number; savedAt?: number }>();
  private seq = 0;

  /** @param loadSeq how many loads of the days on screen have started. */
  constructor(
    private ids: TaskIds,
    private loadSeq: () => number,
  ) {}

  /**
   * Records what task `key` should show while its change is sent. The returned function ends
   * that (unless a newer change to the same task replaced it meanwhile): at once when not sent
   * (failed, or kept in the outbox), else with `sent`, what was saved, kept until a load that
   * started after the save, since one started before may not have it.
   */
  expect(key: string, task: Task | null): (sent?: { task: Task | null }) => void {
    const token = ++this.seq;
    this.changes.set(key, { task, token });
    return (sent) => {
      if (this.changes.get(key)?.token !== token) return;
      if (sent) this.changes.set(key, { task: sent.task, token, savedAt: this.loadSeq() });
      else this.changes.delete(key);
    };
  }

  /** Load number `seq` has finished: changes saved before it started are in it. */
  loaded(seq: number) {
    for (const [key, c] of this.changes) if (c.savedAt !== undefined && c.savedAt < seq) this.changes.delete(key);
  }

  /** `tasks` with these changes applied, keeping each task's place; `shows` tells what's on screen. */
  overlay(tasks: Task[], shows: (t: Task) => boolean): Task[] {
    let out = tasks;
    for (const [key, { task }] of this.changes) {
      const id = this.ids.real(key);
      const next = task && shows(task) ? { ...task, id } : null;
      const at = out.findIndex((t) => t.id === id || t.id === key);
      const rest = out.filter((t) => t.id !== id && t.id !== key);
      if (next) rest.splice(at < 0 ? rest.length : at, 0, next);
      out = rest;
    }
    return out;
  }

  forget() {
    this.changes.clear();
  }
}
