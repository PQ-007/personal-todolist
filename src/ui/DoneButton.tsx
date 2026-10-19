import type { Task } from '../domain/types';
import { planner } from '../state/planner';

export function DoneButton({ task }: { task: Task }) {
  return (
    <button
      type="button"
      className={'donebtn' + (task.done ? ' on' : '')}
      aria-label={task.done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
      aria-pressed={task.done}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        void planner.toggleDone(task.id);
      }}
    />
  );
}
