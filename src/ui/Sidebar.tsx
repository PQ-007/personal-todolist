import type { CSSProperties } from 'react';
import { colorOf } from '../domain/colors';
import { addDays, hm, overlapsDay, sameDay, startOfDay, ymd } from '../domain/dates';
import { matchesQuery } from '../domain/filter';
import { countTasks } from '../domain/markdown/tasks';
import type { Task } from '../domain/types';
import { planner, usePlanner } from '../state/planner';
import { DoneButton } from './DoneButton';
import { useNow } from './hooks';

/** Start time, or for a task continuing from an earlier day, when it ends. */
export function whenLabel(t: Task, day: Date): string {
  if (t.allDay) return 'all day';
  if (t.start >= day) return hm(t.start);
  return t.end <= addDays(day, 1) ? `–${hm(t.end)}` : 'all day';
}

export function Sidebar({ onOpen, onSettings }: { onOpen: (id: string) => void; onSettings: () => void }) {
  const { week, tasks, query, hideDone, settings } = usePlanner();
  const today = startOfDay(useNow());
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i))
    .map((d) => ({
      d,
      items: tasks
        .filter((t) => overlapsDay(t, d) && matchesQuery(t, query) && !(hideDone && t.done))
        .sort((a, b) => a.start.getTime() - b.start.getTime()),
    }))
    .filter((x) => x.items.length);

  return (
    <aside className="side">
      <div className="brand">My Week</div>
      <div className="conn">
        {settings.mode === 'google' ? (
          <>
            <div>
              <b>Google Calendar</b>
              {settings.calendarId || 'primary'}
            </div>
            <button type="button" className="btn" onClick={onSettings}>
              Settings
            </button>
          </>
        ) : (
          <>
            <div>
              <b>Demo data</b>Saved in this browser only
            </div>
            <button type="button" className="btn" onClick={onSettings}>
              Use Google
            </button>
          </>
        )}
      </div>
      <div className="sfilters">
        <input
          type="search"
          placeholder="Search titles and notes"
          aria-label="Search"
          value={query}
          onChange={(e) => planner.setQuery(e.target.value)}
        />
        <label>
          <input type="checkbox" checked={hideDone} onChange={(e) => planner.setHideDone(e.target.checked)} /> Hide
          finished
        </label>
      </div>
      <div className="list">
        {days.length === 0 && <p className="empty">Nothing here yet. Click a time slot in the calendar to add a task.</p>}
        {days.map(({ d, items }) => (
          <section key={ymd(d)} aria-label={d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}>
            <div className={'lday' + (sameDay(d, today) ? ' today' : '')}>
              {d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>
            {items.map((t) => {
              const { t: total, d: dn } = countTasks(t.description);
              return (
                <div
                  key={t.id}
                  className={'lrow' + (t.done ? ' done' : '')}
                  tabIndex={0}
                  style={{ '--c': colorOf(t.colorId) } as CSSProperties}
                  onClick={() => onOpen(t.id)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onOpen(t.id);
                    }
                  }}
                >
                  <DoneButton task={t} />
                  <span className="ltitle">{t.title}</span>
                  <span className="lmeta">
                    <span>{whenLabel(t, d)}</span>
                    {total > 0 && <span>{`${dn}/${total}`}</span>}
                  </span>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </aside>
  );
}
