import type { Task } from '../domain/types';
import { t } from '../i18n';
import { planner } from '../state/planner';
import { chooseDialog } from './confirm';

export const repeats = (task: Task) => !!(task.seriesId || task.recurrence?.length);

/**
 * Like Google Calendar: for a repeating task, asks whether a change is for this task only or
 * for all of them. `allowThis` is false when the change can only apply to the whole series
 * (e.g. how it repeats). Resolves to null when cancelled.
 */
export function askScope(kind: 'edit' | 'delete', allowThis = true): Promise<'this' | 'all' | null> {
  return chooseDialog({
    title: t(kind === 'edit' ? 'rep.scopeEditTitle' : 'rep.scopeDeleteTitle'),
    message: allowThis ? undefined : t('rep.scopeHint'),
    confirmLabel: t(kind === 'edit' ? 'modal.save' : 'menu.delete'),
    danger: kind === 'delete',
    choices: [
      { id: 'this', label: t('rep.thisOne'), disabled: !allowThis },
      { id: 'all', label: t('rep.allOfThem') },
    ],
  }) as Promise<'this' | 'all' | null>;
}

/** Deletes a task; for a repeating one, after asking whether to delete this one or all of them. */
export async function deleteTask(id: string) {
  const task = planner.find(id);
  if (!task) return;
  if (!repeats(task)) return planner.deleteWithUndo(id);
  const scope = await askScope('delete');
  if (scope === 'this') planner.deleteWithUndo(id);
  else if (scope === 'all') await planner.deleteSeries(task);
}
