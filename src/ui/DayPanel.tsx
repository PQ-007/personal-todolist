import { useState, type CSSProperties } from 'react';
import { colorOf, DEFAULT_COLOR } from '../domain/colors';
import { addDays, hm, overlapsDay } from '../domain/dates';
import { countTasks } from '../domain/markdown/tasks';
import type { Task } from '../domain/types';
import { planner, usePlanner } from '../state/planner';
import { DoneButton } from './DoneButton';

/** Start time, or for a task continuing from an earlier day, when it ends. */
function whenLabel(t: Task, day: Date): string {
  if (t.allDay) return '';
  if (t.start >= day) return hm(t.start);
  return t.end <= addDays(day, 1) ? `–${hm(t.end)}` : '';
}

/** Open tasks first (by start), finished ones last. */
const byFocus = (a: Task, b: Task) => Number(a.done) - Number(b.done) || a.start.getTime() - b.start.getTime();

export function FocusView({ onOpen }: { onOpen: (id: string) => void }) {
  const { day, tasks } = usePlanner();
  const [title, setTitle] = useState('');
  const items = tasks.filter((t) => overlapsDay(t, day)).sort(byFocus);
  const current = items.find((t) => !t.done);

  const add = () => {
    const name = title.trim();
    if (!name) return;
    void planner.create({
      title: name,
      description: '',
      start: day,
      end: addDays(day, 1),
      allDay: true,
      colorId: DEFAULT_COLOR,
      done: false,
    });
    setTitle('');
  };

  return (
    <div className="focus">
      <ul className="flist">
        {items.map((t) => {
          const { t: total, d: dn } = countTasks(t.description);
          return (
            <li
              key={t.id}
              className={'frow' + (t.done ? ' done' : '') + (t === current ? ' current' : '')}
              style={{ '--c': colorOf(t.colorId) } as CSSProperties}
              tabIndex={0}
              onClick={() => onOpen(t.id)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onOpen(t.id);
                }
              }}
            >
              <DoneButton task={t} />
              <span className="ftitle">{t.title}</span>
              <span className="fmeta">
                {total > 0 && <span>{`${dn}/${total}`}</span>}
                <span>{whenLabel(t, day)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <input
        className="fadd"
        type="text"
        placeholder={items.length ? 'Add a task' : 'Nothing planned. Add a task'}
        aria-label="Add a task for this day"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) add();
        }}
      />
    </div>
  );
}
