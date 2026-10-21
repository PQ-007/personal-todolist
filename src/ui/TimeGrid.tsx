import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { colorOf } from '../domain/colors';
import { addDays, addMin, hm, overlapsDay, pad, sameDay, startOfDay, ymd } from '../domain/dates';
import { fmtDate, t as tr } from '../i18n';
import { daySegments, layoutDay, type Placed, type TaskSegment } from '../domain/layout';
import { countTasks, previewLines } from '../domain/markdown/tasks';
import { matchesFilter } from '../domain/labels';
import type { Task } from '../domain/types';
import { planner, usePlanner } from '../state/planner';
import { CREATE_SNAP_MIN, HPX, PPM, SNAP_MIN } from './constants';
import { DoneButton } from './DoneButton';
import { useNow } from './hooks';
import { LabelTag } from './LabelTag';

interface Props {
  /** The consecutive days to show as columns. */
  days: Date[];
  onOpen: (id: string) => void;
  onCreate: (start: Date) => void;
}

/** In-progress drag of one card segment. */
interface DragInfo {
  key: string;
  /** Column the drag started in, so the card can't be dropped outside the grid. */
  col: number;
  task: Task;
  resizing: boolean;
  x0: number;
  y0: number;
  colW: number;
  moved: boolean;
  dMin: number;
  dDay: number;
}
type DragView = Pick<DragInfo, 'key' | 'resizing' | 'dMin' | 'dDay' | 'colW'>;

const DRAG_THRESHOLD_PX = 5;

/** Moves both ends by whole days and minutes, so multi-day tasks keep their length. */
const shift = (t: Task, dDay: number, dMin: number) => ({
  ...t,
  start: addMin(addDays(t.start, dDay), dMin),
  end: addMin(addDays(t.end, dDay), dMin),
});
/** Changes only the end; never shorter than one snap step. */
const resize = (t: Task, dMin: number) => {
  const dur = (t.end.getTime() - t.start.getTime()) / 60000;
  return { ...t, end: addMin(t.end, Math.max(dMin, SNAP_MIN - dur)) };
};

/** The time at `clientY` in a day column, snapped down to the create step. */
export function slotTime(col: Element, clientY: number, day: Date): Date {
  const r = col.getBoundingClientRect();
  return addMin(day, Math.floor((clientY - r.top) / PPM / CREATE_SNAP_MIN) * CREATE_SNAP_MIN);
}

export function TimeGrid({ days, onOpen, onCreate }: Props) {
  const { tasks: all, filter } = usePlanner();
  const tasks = all.filter((task) => matchesFilter(task, filter));
  const now = useNow();
  const calRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const [drag, setDrag] = useState<DragView | null>(null);
  const today = startOfDay(now);

  useEffect(() => {
    if (calRef.current) calRef.current.scrollTop = 7 * HPX - 8;
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>, seg: TaskSegment<Task>, key: string, col: number) => {
    if (e.button !== 0 || (e.target as Element).closest('.donebtn')) return;
    const card = e.currentTarget;
    dragRef.current = {
      key,
      col,
      task: seg.task,
      resizing: !!(e.target as Element).closest('.resize'),
      x0: e.clientX,
      y0: e.clientY,
      colW: card.parentElement!.getBoundingClientRect().width,
      moved: false,
      dMin: 0,
      dDay: 0,
    };
    try {
      card.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable (e.g. synthetic events) */
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    const snap = Math.round(dy / PPM / SNAP_MIN) * SNAP_MIN;
    if (d.resizing) {
      const dur = (d.task.end.getTime() - d.task.start.getTime()) / 60000;
      d.dMin = Math.max(snap, SNAP_MIN - dur);
    } else {
      d.dMin = snap;
      d.dDay = Math.min(Math.max(Math.round(dx / d.colW), -d.col), days.length - 1 - d.col);
    }
    setDrag({ key: d.key, resizing: d.resizing, dMin: d.dMin, dDay: d.dDay, colW: d.colW });
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setDrag(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (!d.moved) return onOpen(d.task.id);
    if (d.resizing) {
      if (d.dMin) void planner.update(resize(d.task, d.dMin));
    } else if (d.dMin || d.dDay) void planner.update(shift(d.task, d.dDay, d.dMin));
  };

  const onPointerCancel = () => {
    dragRef.current = null;
    setDrag(null);
  };

  const onCardKey = (e: KeyboardEvent<HTMLDivElement>, t: Task) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(t.id);
      return;
    }
    if (!e.altKey) return;
    // Alt+arrows move the task; Alt+Shift+Up/Down changes its length.
    const moves: Record<string, () => Task> = e.shiftKey
      ? { ArrowUp: () => resize(t, -SNAP_MIN), ArrowDown: () => resize(t, SNAP_MIN) }
      : {
          ArrowUp: () => shift(t, 0, -SNAP_MIN),
          ArrowDown: () => shift(t, 0, SNAP_MIN),
          ArrowLeft: () => shift(t, -1, 0),
          ArrowRight: () => shift(t, 1, 0),
        };
    const mv = moves[e.key];
    if (!mv) return;
    e.preventDefault();
    e.stopPropagation();
    void planner.update(mv());
    const id = t.id;
    // Keep focus on the card after it re-renders in its new place.
    requestAnimationFrame(() => (document.querySelector(`.card[data-id="${CSS.escape(id)}"]`) as HTMLElement | null)?.focus());
  };

  const onColumnClick = (e: MouseEvent<HTMLDivElement>, day: Date) => {
    if ((e.target as Element).closest('.card')) return;
    onCreate(slotTime(e.currentTarget, e.clientY, day));
  };

  return (
    <div
      className={'cal' + (days.length === 1 ? ' single' : '')}
      ref={calRef}
      role="grid"
      aria-label={tr('grid.label')}
      style={{ '--cols': days.length } as CSSProperties}
    >
      <div className="corner" />
      {days.map((d) => (
        <div key={ymd(d)} className={'dh' + (sameDay(d, today) ? ' today' : '')} role="columnheader">
          <button
            type="button"
            className="dhbtn"
            aria-label={tr('grid.openDay', { day: fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric' }) })}
            onClick={() => {
              planner.setDay(d);
              planner.setView('day');
            }}
          >
            <span className="dow">{fmtDate(d, { weekday: 'short' })}</span>
            <span className="dnum">{d.getDate()}</span>
          </button>
        </div>
      ))}

      <div className="adlabel">{tr('grid.allDay')}</div>
      {days.map((d) => (
        <div key={ymd(d)} className="adcell" data-day={ymd(d)}>
          {tasks
            .filter((t) => t.allDay && overlapsDay(t, d))
            .map((t) => (
              <button
                key={t.id}
                type="button"
                className={'chip' + (t.done ? ' done' : '')}
                data-id={t.id}
                style={{ '--c': colorOf(t.colorId) } as CSSProperties}
                onClick={() => onOpen(t.id)}
              >
                {t.title}
              </button>
            ))}
        </div>
      ))}

      <div className="times" aria-hidden="true">
        {Array.from({ length: 23 }, (_, i) => (
          <span key={i} style={{ top: (i + 1) * HPX }}>
            {pad(i + 1)}:00
          </span>
        ))}
      </div>

      {days.map((day, col) => {
        const isToday = sameDay(day, today);
        return (
          <div
            key={ymd(day)}
            className={'dcol' + (isToday ? ' today' : '')}
            data-day={ymd(day)}
            data-slots=""
            onClick={(e) => onColumnClick(e, day)}
          >
            {layoutDay(daySegments(tasks, day)).map((seg) => {
              const key = `${seg.task.id}@${ymd(day)}`;
              return (
                <Card
                  key={key}
                  seg={seg}
                  drag={drag?.key === key ? drag : null}
                  onPointerDown={(e) => onPointerDown(e, seg, key, col)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerCancel}
                  onKeyDown={(e) => onCardKey(e, seg.task)}
                  onContextMenu={onPointerCancel}
                />
              );
            })}
            {isToday && <div className="now" style={{ top: (now.getHours() * 60 + now.getMinutes()) * PPM }} />}
          </div>
        );
      })}
    </div>
  );
}

interface CardProps {
  seg: Placed<TaskSegment<Task>>;
  drag: DragView | null;
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  /** A long press opens the context menu; it must not also count as a click or drag. */
  onContextMenu: () => void;
}

export function timeLabel(t: Task): string {
  if (sameDay(t.start, t.end) || (t.end.getHours() === 0 && t.end.getMinutes() === 0 && sameDay(t.start, addMin(t.end, -1)))) {
    return `${hm(t.start)}–${hm(t.end)}`;
  }
  const wd = (d: Date) => fmtDate(d, { weekday: 'short' });
  return `${wd(t.start)} ${hm(t.start)} – ${wd(t.end)} ${hm(t.end)}`;
}

function Card({ seg, drag, ...handlers }: CardProps) {
  const t = seg.task;
  const c = colorOf(t.colorId);
  const { t: total, d: doneCount } = countTasks(t.description);
  const baseH = Math.max((seg.em - seg.sm) * PPM - 2, 18);
  const h = drag?.resizing ? Math.max(18, baseH + drag.dMin * PPM) : baseH;
  const short = baseH < 40;
  const fill = total ? Math.round((doneCount / total) * 100) : 100;
  const label = timeLabel(t);
  const style = {
    '--c': c,
    top: seg.sm * PPM,
    height: h,
    left: `calc(${(seg.col / seg.cols) * 100}% + 2px)`,
    width: `calc(${100 / seg.cols}% - 4px)`,
    transform: drag && !drag.resizing ? `translate(${drag.dDay * drag.colW}px, ${drag.dMin * PPM}px)` : undefined,
  } as CSSProperties;

  return (
    <div
      className={
        'card' +
        (short ? ' short' : '') +
        (t.done ? ' isdone' : '') +
        (drag ? ' dragging' : '') +
        (seg.endsHere ? '' : ' clipped-end')
      }
      data-id={t.id}
      tabIndex={0}
      role="button"
      aria-label={`${t.title}, ${label}${total ? tr('card.progress', { done: doneCount, total }) : ''}${t.done ? tr('card.finished') : ''}`}
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight"
      title={`${t.title} ${label}`}
      style={style}
      onPointerDown={handlers.onPointerDown}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
      onPointerCancel={handlers.onPointerCancel}
      onKeyDown={handlers.onKeyDown}
      onContextMenu={handlers.onContextMenu}
    >
      <div className="spine">
        <i style={{ height: `${fill}%` }} />
      </div>
      <DoneButton task={t} />
      <div className="ctitle">{t.title}</div>
      <div className="ctime">
        <span>{label}</span>
        {total > 0 && <span className="cp">{`${doneCount}/${total}`}</span>}
        {t.label && <LabelTag label={t.label} iconOnly />}
      </div>
      {!short && <Memo md={t.description} />}
      {seg.endsHere && <div className="resize" aria-hidden="true" />}
    </div>
  );
}

function Memo({ md }: { md: string }) {
  const lines = previewLines(md, 10);
  if (!lines.length) return null;
  return (
    <div className="cmemo" aria-hidden="true">
      {lines.map((l, i) =>
        l.k === 'task' ? (
          <div key={i} className={'ml' + (l.done ? ' d' : '')}>
            <b className={'mbox' + (l.done ? ' on' : '')} />
            {l.t}
          </div>
        ) : (
          <div key={i} className={'ml' + (l.k === 'head' ? ' h' : '')}>
            {l.t}
          </div>
        ),
      )}
    </div>
  );
}
