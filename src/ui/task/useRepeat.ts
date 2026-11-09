import { useEffect, useState } from 'react';
import { parseRule, ruleLine, type Repeat } from '../../domain/recurrence';
import type { Task } from '../../domain/types';
import { planner } from '../../state/planner';

/**
 * How the task in the dialog repeats. An occurrence doesn't carry its series' rule, so that is
 * loaded first (`ready` until then, and the choice is disabled).
 */
export function useRepeat(task: Task | null) {
  const [{ repeat0, lines0 }] = useState(() => ({ repeat0: parseRule(task?.recurrence), lines0: task?.recurrence }));
  const [repeat, setRepeat] = useState<Repeat | null>(repeat0);
  const [orig, setOrig] = useState({ repeat: repeat0, lines: lines0, ready: !task?.seriesId });

  useEffect(() => {
    if (!task?.seriesId) return;
    let live = true;
    void planner.seriesOf(task).then((series) => {
      if (!live) return;
      const r = parseRule(series?.recurrence);
      setRepeat(r);
      setOrig({ repeat: r, lines: series?.recurrence, ready: true });
    });
    return () => {
      live = false;
    };
  }, [task]);

  return {
    repeat,
    setRepeat,
    ready: orig.ready,
    /** Whether the rule is as loaded (a new rule can only apply to the whole series). */
    unchanged: repeat === orig.repeat,
    /** The RRULE lines to save; an unchanged rule is kept exactly as stored (it may have parts we can't edit). */
    lines: (allDay: boolean) => (!repeat ? undefined : repeat === orig.repeat && orig.lines ? orig.lines : [ruleLine(repeat, allDay)]),
  };
}
