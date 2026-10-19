import type { NewTask, Task } from '../domain/types';

/** Where tasks live. The UI only ever talks to this interface. */
export interface TaskStore {
  readonly kind: 'demo' | 'google';
  /** Tasks overlapping [from, to). */
  list(from: Date, to: Date): Promise<Task[]>;
  create(task: NewTask): Promise<Task>;
  /** `prev` is the last known server state, so only changed fields are sent. */
  update(prev: Task, next: Task): Promise<Task>;
  remove(id: string): Promise<void>;
}

/** The user has to sign in (again) before the store can be used. */
export class AuthError extends Error {
  constructor(message = 'Google session ended. Press Connect to continue.') {
    super(message);
    this.name = 'AuthError';
  }
}

/** The task was changed elsewhere since we last loaded it. */
export class ConflictError extends Error {
  constructor(message = 'This task was changed in Google Calendar. The latest version has been loaded.') {
    super(message);
    this.name = 'ConflictError';
  }
}
