import { useState } from 'react';
import { addDays, sameDay, startOfDay, ymd } from '../domain/dates';
import { addMonths, monthGrid, rangeDays } from '../domain/views';
import { fmtDate, t } from '../i18n';
import { planner, usePlanner } from '../state/planner';
import { useNow } from './hooks';
import { Icon } from './Icon';

/**
 * A small month calendar: today is circled, the days on screen are highlighted, and clicking
 * a date selects it. Its own arrows browse months without moving the main view.
 */
export function MiniCalendar() {
  const { day, range } = usePlanner();
  const today = startOfDay(useNow());
  const [month, setMonth] = useState(() => new Date(day.getFullYear(), day.getMonth(), 1));
  const [shownFor, setShownFor] = useState(ymd(day));

  // When the selected day changes, show its month again (even after browsing elsewhere).
  if (shownFor !== ymd(day)) {
    setShownFor(ymd(day));
    setMonth(new Date(day.getFullYear(), day.getMonth(), 1));
  }

  const cells = rangeDays(monthGrid(month));
  const shownEnd = addDays(range.from, range.days);
  const shown = (d: Date) => d >= range.from && d < shownEnd;
  const weekdays = cells.slice(0, 7).map((d) => fmtDate(d, { weekday: 'narrow' }));

  return (
    <section className="mini" aria-label={t('mini.label')}>
      <div className="mini-head">
        <h2>{fmtDate(month, { year: 'numeric', month: 'long' })}</h2>
        <button type="button" className="iconbtn" aria-label={t('mini.prevMonth')} title={t('mini.prevMonth')} onClick={() => setMonth(addMonths(month, -1))}>
          <Icon name="chevron-up" size={16} />
        </button>
        <button type="button" className="iconbtn" aria-label={t('mini.nextMonth')} title={t('mini.nextMonth')} onClick={() => setMonth(addMonths(month, 1))}>
          <Icon name="chevron-down" size={16} />
        </button>
      </div>
      <div className="mini-grid" role="grid">
        {weekdays.map((w, i) => (
          <span key={i} className="mini-dow" aria-hidden="true">
            {w}
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
                (inShown ? ' shown' : '') +
                (inShown && !shown(addDays(d, -1)) ? ' first' : '') +
                (inShown && !shown(addDays(d, 1)) ? ' last' : '') +
                (sameDay(d, today) ? ' today' : '') +
                (sameDay(d, day) ? ' sel' : '')
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
