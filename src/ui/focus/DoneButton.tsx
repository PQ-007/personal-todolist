import type { Task } from '../domain/types';
import { t } from '../i18n';
import { planner } from '../state/planner';

export function DoneButton({ task }: { task: Task }) {
  return (
    <button
      type="button"
      className={'donebtn' + (task.done ? ' on' : '')}
      aria-label={t(task.done ? 'done.unmark' : 'done.mark', { title: task.title })}
      aria-pressed={task.done}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        void planner.toggleDone(task.id);
      }}
    />
  );
}
