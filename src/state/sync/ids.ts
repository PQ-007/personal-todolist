/**
 * Task ids as they change: a task created here has a temporary id until it's saved, a preview
 * occurrence has one until the calendar makes the real occurrence, and a deleted series that
 * is brought back gets a new id. Each points to the id it became, so changes made meanwhile
 * still reach the task.
 */
export class TaskIds {
  /** Earlier id → the id it became. */
  private aliases = new Map<string, string>();
  private seq = 0;

  /** The current id of a task. */
  real = (id: string) => this.aliases.get(id) ?? id;

  /** Queue key for a task: the id it was first known by in this session, so its changes stay in one queue. */
  keyOf = (id: string) => [...this.aliases].find(([, v]) => v === id)?.[0] ?? id;

  /** From now on `id` means `real`. */
  link(id: string, real: string) {
    this.aliases.set(id, real);
  }

  /** A temporary id, until the calendar gives the real one. */
  temp = () => `tmp-${Date.now().toString(36)}-${++this.seq}`;
}
