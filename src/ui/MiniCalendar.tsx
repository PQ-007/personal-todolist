import { useEffect, useState } from 'react';
import { addDays, sameDay, startOfDay, ymd } from '../domain/dates';
import { matchesFilter } from '../domain/labels';
import type { Task } from '../domain/types';
import { addMonths, monthGrid, rangeDays } from '../domain/views';
import { fmtDate, t } from '../i18n';
import { planner, usePlanner } from '../state/planner';
import { useNow } from './hooks';
import { Icon } from './Icon';

/** Days (yyyy-mm-dd) with at least one task. */
function busyDays(tasks: Task[], from: Date, to: Date): Set<string> {
  const busy = new Set<string>();
  for (const task of tasks) {
    for (let d = startOfDay(task.start < from ? from : task.start); d < task.end && d < to; d = addDays(d, 1)) busy.add(ymd(d));
  }
  return busy;
}

/**
 * A small month calendar: today is filled, the selected day is ringed, the days on screen sit
 * on a band, and a dot marks days that have tasks. Clicking a date selects it; the arrows
 * browse months without moving the main view.
 */
export function MiniCalendar() {
  const { day, range, tasks, filter, settings } = usePlanner();
  const today = startOfDay(useNow());
  const [month, setMonth] = useState(() => new Date(day.getFullYear(), day.getMonth(), 1));
  const [shownFor, setShownFor] = useState(ymd(day));
  /** Tasks of the browsed month, looked up separately because only the days on screen are loaded. */
  const [monthTasks, setMonthTasks] = useState<{ key: string; tasks: Task[] }>({ key: '', tasks: [] });

  // When the selected day changes, show its month again (even after browsing elsewhere).
  if (shownFor !== ymd(day)) {
    setShownFor(ymd(day));
    setMonth(new Date(day.getFullYear(), day.getMonth(), 1));
  }

  const grid = monthGrid(month);
  const gridEnd = addDays(grid.from, grid.days);
  const key = `${settings.mode}:${ymd(grid.from)}`;
  useEffect(() => {
    let live = true;
    void planner.peek(grid.from, gridEnd).then((found) => live && setMonthTasks({ key, tasks: found }));
    return () => {
      live = false;
    };
    // `key` covers the grid and the data source; `tasks` refetches after edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tasks]);

  const cells = rangeDays(grid);
  const shownEnd = addDays(range.from, range.days);
  // The band marks several days on screen; a single day is already marked by the selection ring.
  const shown = (d: Date) => range.days > 1 && d >= range.from && d < shownEnd;
  // Days on screen use the live tasks (they reflect edits at once); the rest come from the lookup.
  const inRange = (task: Task) => task.start < shownEnd && task.end > range.from;
  const known = (monthTasks.key === key ? monthTasks.tasks : []).filter((task) => !inRange(task));
  const busy = busyDays([...known, ...tasks].filter((task) => matchesFilter(task, filter)), grid.from, gridEnd);
  const weekdays = cells.slice(0, 7);

  return (
    <section className="mini" aria-label={t('mini.label')}>
      <div className="mini-head">
        <h2>{fmtDate(month, { year: 'numeric', month: 'long' })}</h2>
        <button type="button" className="iconbtn" aria-label={t('mini.prevMonth')} title={t('mini.prevMonth')} onClick={() => setMonth(addMonths(month, -1))}>
          <Icon name="chevron-left" size={16} />
        </button>
        <button type="button" className="iconbtn" aria-label={t('mini.nextMonth')} title={t('mini.nextMonth')} onClick={() => setMonth(addMonths(month, 1))}>
          <Icon name="chevron-right" size={16} />
        </button>
      </div>
      <div className="mini-grid" role="grid">
        {weekdays.map((d) => (
          <span key={ymd(d)} className={'mini-dow' + (d.getDay() % 6 === 0 ? ' weekend' : '')} aria-hidden="true">
            {fmtDate(d, { weekday: 'narrow' })}
          </span>
        ))}
        {cells.map((d) => {
          const inShown = shown(d);
          return (
            <button
              key={ymd(d)}
              type="button"
              className={
                'mini-day' +
                (d.getMonth() !== month.getMonth() ? ' out' : '') +
                (d.getDay() % 6 === 0 ? ' weekend' : '') +
                (inShown ? ' shown' : '') +
                (inShown && !shown(addDays(d, -1)) ? ' first' : '') +
                (inShown && !shown(addDays(d, 1)) ? ' last' : '') +
                (sameDay(d, today) ? ' today' : '') +
                (sameDay(d, day) ? ' sel' : '') +
                (busy.has(ymd(d)) ? ' busy' : '')
              }
              aria-label={fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric' })}
              aria-current={sameDay(d, today) ? 'date' : undefined}
              aria-pressed={sameDay(d, day)}
              onClick={() => planner.setDay(d)}
            >
              <span>{d.getDate()}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
