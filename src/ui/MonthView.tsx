import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { colorOf } from '../domain/colors';
import { hm, overlapsDay, sameDay, startOfDay, ymd } from '../domain/dates';
import { matchesFilter } from '../domain/labels';
import type { Task } from '../domain/types';
import { rangeDays } from '../domain/views';
import { fmtDate, t } from '../i18n';
import { planner, usePlanner } from '../state/planner';
import { isStackDrag, stackDrag } from './dnd';
import { useNow } from './hooks';

/** Sizes in px that decide how many tasks fit in a day cell (see .mcell, .mnum and .mchip). */
const HEADER_H = 33;
const MIN_CELL_H = 108;
const CELL_CHROME_H = 38;
const CHIP_H = 23;

/** How many task rows fit in each day cell of the month grid in `ref`, kept up to date on resize. */
function useChipsPerCell(ref: RefObject<HTMLDivElement | null>, rows: number) {
  const [fit, setFit] = useState(3);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const cellH = Math.max(MIN_CELL_H, (el.clientHeight - HEADER_H) / rows);
      setFit(Math.max(1, Math.floor((cellH - CELL_CHROME_H) / CHIP_H)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, rows]);
  return fit;
}

/** All-day tasks first, then by start time. */
const byStart = (a: Task, b: Task) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime();

const openDay = (d: Date) => {
  planner.setDay(d);
  planner.setView('day', 1);
};

/**
 * The month as weeks of day cells, each listing its first few tasks. Clicking a cell selects
 * the day (the sidebar lists it); its date number or "+N more" opens it in the day view.
 */
export function MonthView({ onOpen }: { onOpen: (id: string) => void }) {
  const { range, day, tasks: all, filter } = usePlanner();
  const today = startOfDay(useNow());
  const tasks = all.filter((task) => matchesFilter(task, filter)).sort(byStart);
  const days = rangeDays(range);
  const ref = useRef<HTMLDivElement>(null);
  const maxChips = useChipsPerCell(ref, days.length / 7);

  return (
    <div ref={ref} className="month" role="grid" aria-label={t('grid.label')} style={{ '--rows': days.length / 7 } as CSSProperties}>
      {days.slice(0, 7).map((d) => (
        <div key={ymd(d)} className="month-dow" role="columnheader">
          {fmtDate(d, { weekday: 'short' })}
        </div>
      ))}
      {days.map((d) => {
        const items = tasks.filter((task) => overlapsDay(task, d));
        const extra = items.length - maxChips;
        return (
          <div
            key={ymd(d)}
            className={
              'mcell' +
              (d.getMonth() !== day.getMonth() ? ' out' : '') +
              (sameDay(d, today) ? ' today' : '') +
              (sameDay(d, day) ? ' sel' : '') +
              (d.getDay() === 0 || d.getDay() === 6 ? ' weekend' : '')
            }
            role="gridcell"
            data-day={ymd(d)}
            onClick={(e) => {
              if (!(e.target as Element).closest('button')) planner.setDay(d);
            }}
            // A to-do dropped on a day goes to that day's first free time.
            onDragOver={(e) => {
              if (!isStackDrag(e)) return;
              e.preventDefault();
              e.currentTarget.classList.add('dropping');
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) e.currentTarget.classList.remove('dropping');
            }}
            onDrop={(e) => {
              if (!isStackDrag(e)) return;
              e.preventDefault();
              e.currentTarget.classList.remove('dropping');
              void planner.scheduleItemOn(stackDrag.item!.id, d);
            }}
          >
            <button
              type="button"
              className="mnum"
              aria-label={t('grid.openDay', { day: fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric' }) })}
              onClick={() => openDay(d)}
            >
              {d.getDate() === 1 ? fmtDate(d, { month: 'short', day: 'numeric' }) : d.getDate()}
            </button>
            {items.slice(0, extra > 0 ? maxChips - 1 : maxChips).map((task) => (
              <button
                key={task.id}
                type="button"
                className={'mchip' + (task.allDay ? ' allday' : '') + (task.done ? ' done' : '')}
                data-id={task.id}
                style={{ '--c': colorOf(task.colorId) } as CSSProperties}
                title={task.title}
                onClick={() => onOpen(task.id)}
              >
                {!task.allDay && <span className="mtime">{task.start >= d ? hm(task.start) : ''}</span>}
                <span className="mtitle-text">{task.title}</span>
              </button>
            ))}
            {extra > 0 && (
              <button type="button" className="mmore" onClick={() => openDay(d)}>
                {t('month.more', { n: extra + 1 })}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
