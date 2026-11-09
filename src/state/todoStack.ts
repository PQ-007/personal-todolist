import { createStackStore, type StackStore } from '../data/stackStore';
import { copyOf } from '../domain/clipboard';
import { addDays, hm, startOfDay } from '../domain/dates';
import { itemFromTask, nextFreeSlot, taskFromItem, type StackItem } from '../domain/stack';
import type { NewTask, Task } from '../domain/types';
import { fmtDate, t as tr } from '../i18n';
import type { StateAccess } from './plannerState';
import { saveStackOpen, type Mode } from './settings';

/** What the to-do stack needs from the calendar to move to-dos onto it and back. */
export interface Calendar {
  find(id: string): Task | undefined;
  /** Creates a task (shown at once); returns its id. */
  add(task: NewTask): string;
  remove(id: string): void;
  /** Tasks in days that may not be on screen (see `DayLoader.tasksIn`). */
  tasksIn(from: Date, days: number): Promise<Task[]>;
}

/**
 * The to-do stack: to-dos without a time yet, in the user's order, kept in this browser (one
 * list per calendar mode). A to-do can be put on the calendar, and a task taken off it.
 */
export class TodoStack {
  private store!: StackStore;
  private seq = 0;

  constructor(
    private state: StateAccess,
    private calendar: Calendar,
  ) {}

  /** The list of calendar mode `mode`. */
  load(mode: Mode) {
    this.store = createStackStore(mode);
    this.state.set({ stack: this.store.load() });
  }

  private get items() {
    return this.state.get().stack;
  }

  private save(stack: StackItem[]) {
    this.store.save(stack);
    this.state.set({ stack });
  }

  private newId = () => `s-${Date.now().toString(36)}-${++this.seq}`;

  setOpen(open: boolean) {
    saveStackOpen(open);
    this.state.set({ stackOpen: open });
  }

  /** Adds a to-do at the end. */
  add(fields: Omit<StackItem, 'id'>) {
    this.save([...this.items, { id: this.newId(), ...fields }]);
  }

  update(id: string, patch: Partial<Omit<StackItem, 'id'>>) {
    this.save(this.items.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  /** Moves an item so it ends up at `index` in the list as it is now. */
  move(id: string, index: number) {
    const from = this.items.findIndex((s) => s.id === id);
    if (from < 0) return;
    const next = [...this.items];
    const [item] = next.splice(from, 1);
    next.splice(from < index ? index - 1 : index, 0, item!);
    this.save(next);
  }

  /** Takes an item out; returns it with its position, to put it back on undo. */
  private take(id: string): { item: StackItem; index: number } | null {
    const index = this.items.findIndex((s) => s.id === id);
    if (index < 0) return null;
    const item = this.items[index]!;
    this.save(this.items.filter((s) => s.id !== id));
    return { item, index };
  }

  private putBack(item: StackItem, index: number) {
    const next = [...this.items];
    next.splice(Math.min(index, next.length), 0, item);
    this.save(next);
  }

  delete(id: string) {
    const taken = this.take(id);
    if (!taken) return;
    this.state.toast(tr('toast.deleted', { title: taken.item.title }), {
      label: tr('toast.undo'),
      run: () => this.putBack(taken.item, taken.index),
    });
  }

  /** Puts a to-do on the calendar at `start` (or on that day when `allDay`). Undo puts it back. */
  schedule(id: string, start: Date, allDay = false) {
    const taken = this.take(id);
    if (!taken) return;
    const taskId = this.calendar.add(taskFromItem(taken.item, start, allDay));
    const when = fmtDate(start, { month: 'short', day: 'numeric', weekday: 'short' }) + (allDay ? '' : ' ' + hm(start));
    this.state.toast(tr('stack.scheduled', { title: taken.item.title, when }), {
      label: tr('toast.undo'),
      run: () => {
        this.calendar.remove(taskId);
        this.putBack(taken.item, taken.index);
      },
    });
  }

  /** Schedules a to-do at the first free time on `day` (see `nextFreeSlot`). */
  async scheduleOn(id: string, day: Date) {
    const item = this.items.find((s) => s.id === id);
    if (!item) return;
    const d = startOfDay(day);
    const { range, tasks: shown } = this.state.get();
    let tasks = shown;
    if (d < range.from || d >= addDays(range.from, range.days)) {
      try {
        tasks = await this.calendar.tasksIn(d, 1);
      } catch (e) {
        this.state.fail(e);
        return;
      }
    }
    this.schedule(id, nextFreeSlot(tasks, d, item.minutes, new Date()));
  }

  /** Moves a calendar task to the top of the stack. Undo restores the task. */
  unschedule(taskId: string) {
    const t = this.calendar.find(taskId);
    if (!t) return;
    const item = itemFromTask(t, this.newId());
    this.save([item, ...this.items]);
    this.calendar.remove(t.id);
    this.state.toast(tr('stack.moved', { title: t.title }), {
      label: tr('toast.undo'),
      run: () => {
        this.take(item.id);
        this.calendar.add({ ...copyOf(t), done: t.done, extraProps: t.extraProps });
      },
    });
  }
}
