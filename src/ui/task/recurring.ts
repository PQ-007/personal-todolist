import { copyOf } from '../domain/clipboard';
import type { Task } from '../domain/types';
import { t } from '../i18n';
import { planner, type SeriesEdit } from '../state/planner';
import { chooseDialog } from './confirm';

export const repeats = (task: Task) => !!(task.seriesId || task.recurrence?.length);

/**
 * Like Google Calendar: for a repeating task, asks whether a change is for this task only or
 * for all of them. `allowThis` is false when the change can only apply to the whole series
 * (e.g. how it repeats). Resolves to null when cancelled.
 */
export type Scope = 'this' | 'following' | 'all';

export function askScope(kind: 'edit' | 'delete', allowThis = true): Promise<Scope | null> {
  return chooseDialog({
    title: t(kind === 'edit' ? 'rep.scopeEditTitle' : 'rep.scopeDeleteTitle'),
    message: allowThis ? undefined : t('rep.scopeHint'),
    confirmLabel: t(kind === 'edit' ? 'modal.save' : 'menu.delete'),
    danger: kind === 'delete',
    choices: [
      { id: 'this', label: t('rep.thisOne'), disabled: !allowThis },
      { id: 'following', label: t('rep.following') },
      { id: 'all', label: t('rep.allOfThem') },
    ],
  }) as Promise<Scope | null>;
}

/**
 * Saves a task moved or resized on the calendar (`next` is `task` with new times). For a
 * repeating one, asks whether the move is for this occurrence, this and the following ones, or
 * all of them; the series keeps its own content and takes only the new times.
 */
export async function saveMoved(task: Task, next: Task) {
  if (!repeats(task)) return planner.update(next);
  // Fetched while the question is open, so the answer shows at once.
  void planner.seriesOf(task);
  const scope = await askScope('edit');
  if (scope === 'this') return planner.update(next);
  if (!scope) return;
  const move: SeriesEdit = (series) => ({
    next: { ...copyOf(series), start: next.start, end: next.end, allDay: next.allDay },
    recurrence: series.recurrence,
  });
  if (scope === 'following') await planner.updateFollowing(task, move);
  else await planner.updateSeries(task, move);
}

/** Deletes a task; for a repeating one, after asking whether to delete this one or all of them. */
export async function deleteTask(id: string) {
  const task = planner.find(id);
  if (!task) return;
  if (!repeats(task)) return planner.deleteWithUndo(id);
  const scope = await askScope('delete');
  if (scope === 'this') planner.deleteWithUndo(id);
  else if (scope === 'following') await planner.deleteFollowing(task);
  else if (scope === 'all') await planner.deleteSeries(task);
}
