import { parseTagField } from '../../domain/tags';
import type { Task } from '../../domain/types';
import { rangeFromForm, validateRange } from '../../domain/when';
import { t as tr } from '../../i18n';
import { planner } from '../../state/planner';
import type { Draft } from './draft';
import { askScope, repeats } from './recurring';

export interface SaveInput {
  /** The task edited, null for a new one. */
  task: Task | null;
  draft: Draft;
  /** Saved as a to-do of `minutes` (on the stack) rather than on the calendar. */
  todo: boolean;
  minutes: number;
  /** See `useRepeat`. */
  repeat: { ready: boolean; unchanged: boolean; lines: (allDay: boolean) => string[] | undefined };
}

/**
 * Saves the task dialog: a new task, a to-do, or an edit (asking, for a repeating task, which
 * occurrences it's for). `close` runs once it's saved; an incomplete form shows why instead
 * (`focusTitle` when the title is missing).
 */
export async function saveDraft({ task, draft, todo, minutes, repeat }: SaveInput, close: () => void, focusTitle: () => void) {
  const title = draft.title.trim();
  if (!title) {
    planner.toast(tr('modal.needTitle'));
    focusTitle();
    return;
  }
  const { description, colorId, label, done, reminders } = draft;
  const tags = parseTagField(draft.tagsText);
  if (todo) {
    close();
    planner.addStackItem({ title, description, colorId, label, tags, minutes });
    // Show where it went.
    if (planner.get().mode === 'plan') planner.setStackOpen(true);
    return;
  }
  const range = rangeFromForm(draft.when);
  const err = validateRange(range);
  if (err) {
    planner.toast(tr(err));
    return;
  }
  const fields = { title, description, colorId, label, tags, done, reminders, ...range };
  const recurrence = repeat.lines(range.allDay);
  if (!task) {
    close();
    void planner.create({ ...fields, recurrence });
    return;
  }
  const cur = planner.find(task.id) ?? task;
  if (repeats(cur)) {
    if (!repeat.ready) return;
    // A new rule can only apply to the whole series.
    const scope = await askScope('edit', repeat.unchanged);
    if (!scope) return;
    close();
    if (scope === 'this') void planner.update({ ...cur, ...fields });
    else if (scope === 'following') void planner.updateFollowing(cur, () => ({ next: fields, recurrence }));
    else void planner.updateSeries(cur, () => ({ next: fields, recurrence }));
    return;
  }
  close();
  // A task that starts repeating becomes a series.
  if (recurrence) void planner.startRepeating({ ...cur, ...fields, recurrence });
  else void planner.update({ ...cur, ...fields });
}
