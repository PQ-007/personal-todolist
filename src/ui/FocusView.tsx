import { useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { colorOf } from '../domain/colors';
import { addMin, dayDiff, hm, overlapsDay, sameDay } from '../domain/dates';
import { matchesFilter } from '../domain/labels';
import { countTasks, toggleTaskLine } from '../domain/markdown/tasks';
import type { StackItem } from '../domain/stack';
import type { Task } from '../domain/types';
import { fmtDate, fmtDuration, t, type MsgKey } from '../i18n';
import { planner, usePlanner } from '../state/planner';
import type { MenuState } from './ContextMenu';
import { DoneButton } from './DoneButton';
import { useNow } from './hooks';
import { Icon } from './Icon';
import { LabelTag } from './LabelTag';
import { repeats } from './recurring';
import { MarkdownView } from './MarkdownView';
import { stackItemMenu } from './stackMenu';
import { TagChip } from './TagChip';

const RELATIVE: Record<number, MsgKey> = { [-1]: 'day.yesterday', 0: 'day.today', 1: 'day.tomorrow' };

/** "Today", "Tomorrow", "Yesterday" or the weekday name. */
function dayName(d: Date, now: Date): string {
  const rel = RELATIVE[dayDiff(now, d)];
  return rel ? t(rel) : fmtDate(d, { weekday: 'long' });
}

const byStart = (a: Task, b: Task) => a.start.getTime() - b.start.getTime();
const minutesBetween = (a: Date, b: Date) => Math.max(1, Math.round((b.getTime() - a.getTime()) / 60000));

/** Starting a to-do "now" rounds down to 5 minutes, so the block lines up with the grid. */
const startNow = (now: Date) => addMin(now, -(now.getMinutes() % 5) - now.getSeconds() / 60);

const onActivate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    fn();
  }
};

interface Props {
  onEdit: (id: string) => void;
  onMenu: (menu: MenuState) => void;
  /** Opens the task menu (the same one as right-clicking a task in the calendar). */
  onTaskMenu: (id: string, x: number, y: number) => void;
  /** Opens the add dialog for this day. */
  onAdd: (day: Date) => void;
  /**
   * The narrow version in plan mode's left sidebar: smaller type, and no to-do list (the
   * stack panel on the right shows it).
   */
  compact?: boolean;
}

/**
 * Today's work, one task at a time: the task to do now is open, everything else is a row
 * that opens in place (no dialog) when clicked. Used full-screen in focus mode and in the
 * left sidebar of plan mode.
 */
export function FocusView({ onEdit, onMenu, onTaskMenu, onAdd, compact }: Props) {
  const { day, tasks: all, stack, filter, sync } = usePlanner();
  const now = useNow();
  const [expanded, setExpanded] = useState<string | null>(null);
  const isToday = sameDay(day, now);
  const relative = Math.abs(dayDiff(now, day)) <= 1;
  const tasks = all.filter((task) => matchesFilter(task, filter) && overlapsDay(task, day));
  const allDay = tasks.filter((task) => task.allDay);
  const open = tasks.filter((task) => !task.allDay && !task.done).sort(byStart);
  // The task to work on: the one in progress that started last (so a to-do you just started takes
  // over), else the next one today, else the earliest open one.
  const running = isToday ? open.filter((task) => task.start <= now && task.end > now) : [];
  const current = running.at(-1) ?? (isToday ? open.find((task) => task.end > now) : undefined) ?? open[0];
  const later = open.filter((task) => task !== current);
  const done = tasks.filter((task) => task.done).sort(byStart);
  const todos = compact ? [] : stack.filter((s) => matchesFilter(s, filter));
  const total = tasks.length;
  const toggle = (id: string) => setExpanded((e) => (e === id ? null : id));
  const expandedAllDay = allDay.find((task) => task.id === expanded);
  const card = { now, isToday, onEdit, onTaskMenu };

  const rows = (list: Task[]) =>
    list.map((task) =>
      task.id === expanded ? (
        <li key={task.id}>
          <TaskCard task={task} {...card} onCollapse={() => setExpanded(null)} />
        </li>
      ) : (
        <TaskRow key={task.id} task={task} day={day} onToggle={() => toggle(task.id)} />
      ),
    );

  return (
    <div className={'focus' + (compact ? ' compact' : '')}>
      <header className="f-head">
        <h1>{dayName(day, now)}</h1>
        <p className="f-date">
          {/* The heading is already the weekday unless it says Today, Tomorrow or Yesterday. */}
          {fmtDate(day, relative ? { weekday: compact ? 'short' : 'long', month: 'long', day: 'numeric' } : { month: 'long', day: 'numeric' })}
          {total > 0 && <span className="f-count">{t('panel.progress', { done: done.length, total })}</span>}
        </p>
        {total > 0 && (
          <div className="f-bar" role="progressbar" aria-label={t('panel.progressLabel')} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done.length}>
            <i style={{ width: `${(done.length / total) * 100}%` }} />
          </div>
        )}
        {allDay.length > 0 && (
          <ul className="f-allday" aria-label={t('grid.allDay')}>
            {allDay.map((task) => (
              <li
                key={task.id}
                className={(task.done ? 'done' : '') + (task.id === expanded ? ' on' : '')}
                style={{ '--c': colorOf(task.colorId) } as CSSProperties}
                data-id={task.id}
              >
                <DoneButton task={task} />
                <button type="button" aria-expanded={task.id === expanded} onClick={() => toggle(task.id)}>
                  {task.title}
                </button>
              </li>
            ))}
          </ul>
        )}
        {expandedAllDay && <TaskCard task={expandedAllDay} {...card} onCollapse={() => setExpanded(null)} />}
      </header>

      {current ? (
        <TaskCard task={current} {...card} hero />
      ) : (
        sync !== 'loading' && (
          <section className="f-card f-empty">
            <p className="f-empty-title">{t(total ? 'focus.dayDone' : 'focus.nothing')}</p>
            <p>{t('focus.nothingHint')}</p>
          </section>
        )
      )}

      {later.length > 0 && (
        <section className="f-section" aria-label={t(isToday ? 'focus.laterToday' : 'panel.later')}>
          <h2>{t(isToday ? 'focus.laterToday' : 'panel.later')}</h2>
          <ul className="f-list">{rows(later)}</ul>
        </section>
      )}

      {todos.length > 0 && (
        <section className="f-section" aria-label={t('stack.title')}>
          <h2>{t('stack.title')}</h2>
          <ul className="f-list">
            {todos.map((item) => (
              <TodoRow key={item.id} item={item} day={day} isToday={isToday} now={now} onMenu={onMenu} />
            ))}
          </ul>
        </section>
      )}

      <button type="button" className="f-addbtn" aria-keyshortcuts="c" onClick={() => onAdd(day)}>
        <Icon name="plus" />
        {t('add.button')}
      </button>

      {done.length > 0 && (
        <details className="f-section f-done">
          <summary>
            <h2>{t('panel.completed', { n: done.length })}</h2>
          </summary>
          <ul className="f-list">{rows(done)}</ul>
        </details>
      )}
    </div>
  );
}

interface CardProps {
  task: Task;
  now: Date;
  isToday: boolean;
  onEdit: (id: string) => void;
  onTaskMenu: (id: string, x: number, y: number) => void;
  /** The task to do now, shown first and large. */
  hero?: boolean;
  /** For a row opened in place: collapses it back to a row. */
  onCollapse?: () => void;
}

/** A task shown open: time, label and tags, live checklist, and its actions. */
function TaskCard({ task, now, isToday, onEdit, onTaskMenu, hero, onCollapse }: CardProps) {
  const { t: total, d: dn } = countTasks(task.description);
  const running = isToday && !task.allDay && !task.done && task.start <= now && task.end > now;
  const overdue = isToday && !task.allDay && !task.done && task.end <= now;
  const status: MsgKey | null = running ? 'panel.now' : overdue ? 'focus.overdue' : hero ? 'panel.next' : null;
  const countdown =
    task.allDay || task.done
      ? ''
      : running
        ? t('focus.left', { d: fmtDuration(minutesBetween(now, task.end)) })
        : isToday && !overdue
          ? t('focus.in', { d: fmtDuration(minutesBetween(now, task.start)) })
          : '';
  const pct = running ? ((now.getTime() - task.start.getTime()) / (task.end.getTime() - task.start.getTime())) * 100 : 0;
  const titleId = `f-title-${task.id}`;

  return (
    <section
      className={'f-card' + (hero ? ' hero' : ' inline') + (running ? ' running' : '') + (overdue ? ' overdue' : '') + (task.done ? ' isdone' : '')}
      style={{ '--c': colorOf(task.colorId) } as CSSProperties}
      aria-labelledby={titleId}
      data-id={task.id}
    >
      <div className="f-card-meta">
        {status && <span className="f-status">{t(status)}</span>}
        <span>{task.allDay ? t('modal.allDay') : `${hm(task.start)} – ${hm(task.end)}`}</span>
        {countdown && <span className="f-countdown">{countdown}</span>}
        <span className="sp" />
        {repeats(task) && (
          <span className="f-repeat" title={t('rep.label')}>
            <Icon name="repeat" size={14} />
          </span>
        )}
        {task.label && <LabelTag label={task.label} />}
        {task.tags?.map((tag) => <TagChip key={tag} tag={tag} />)}
        {onCollapse && (
          <button type="button" className="iconbtn f-collapse" aria-label={t('focus.collapse')} title={t('focus.collapse')} onClick={onCollapse}>
            <Icon name="chevron-up" size={16} />
          </button>
        )}
      </div>
      <h2 id={titleId} className={'f-card-title' + (onCollapse ? ' collapsible' : '')} onClick={onCollapse}>
        {task.title}
      </h2>
      {running && (
        <div className="f-time" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </div>
      )}
      {task.description.trim() && (
        <div className="f-notes">
          {total > 0 && <p className="f-steps">{t('panel.steps', { done: dn, total })}</p>}
          <MarkdownView source={task.description} onToggle={(line) => void planner.patch(task.id, { description: toggleTaskLine(task.description, line) })} />
        </div>
      )}
      <div className="f-actions">
        <button type="button" className={'btn' + (task.done ? '' : ' primary')} onClick={() => void planner.toggleDone(task.id)}>
          <Icon name={task.done ? 'x' : 'check'} size={16} />
          {t(task.done ? 'menu.markUndone' : 'panel.markDone')}
        </button>
        <button type="button" className="btn ghost" onClick={() => onEdit(task.id)}>
          {t('panel.edit')}
        </button>
        <span className="sp" />
        <button
          type="button"
          className="iconbtn"
          aria-label={t('focus.more')}
          title={t('focus.more')}
          aria-haspopup="menu"
          onClick={(e: MouseEvent<HTMLButtonElement>) => {
            const r = e.currentTarget.getBoundingClientRect();
            onTaskMenu(task.id, r.right - 240, r.bottom + 4);
          }}
        >
          <Icon name="more" />
        </button>
      </div>
    </section>
  );
}

/** A task as one line; clicking it opens it in place. */
function TaskRow({ task, day, onToggle }: { task: Task; day: Date; onToggle: () => void }) {
  const { t: total, d: dn } = countTasks(task.description);
  // A task continuing from an earlier day shows when it ends.
  const time = task.allDay ? '' : task.start >= day ? hm(task.start) : `–${hm(task.end)}`;
  return (
    <li
      className={'f-row' + (task.done ? ' done' : '')}
      style={{ '--c': colorOf(task.colorId) } as CSSProperties}
      data-id={task.id}
      tabIndex={0}
      aria-expanded={false}
      onClick={onToggle}
      onKeyDown={onActivate(onToggle)}
    >
      <DoneButton task={task} />
      <span className="f-row-time">{time}</span>
      <span className="f-row-title">{task.title}</span>
      <span className="f-row-meta">
        {task.label && <LabelTag label={task.label} iconOnly />}
        {total > 0 && <span>{`${dn}/${total}`}</span>}
      </span>
    </li>
  );
}

interface TodoRowProps {
  item: StackItem;
  day: Date;
  isToday: boolean;
  now: Date;
  onMenu: (menu: MenuState) => void;
}

function TodoRow({ item, day, isToday, now, onMenu }: TodoRowProps) {
  const start = () => (isToday ? planner.scheduleItem(item.id, startNow(now)) : void planner.scheduleItemOn(item.id, day));
  const label = isToday ? t('focus.startTitle', { title: item.title }) : t('focus.schedule');
  return (
    <li
      className="f-row f-todo"
      style={{ '--c': colorOf(item.colorId) } as CSSProperties}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onMenu({ x: e.clientX, y: e.clientY, label: item.title, items: stackItemMenu(item) });
      }}
    >
      <button type="button" className="f-start" aria-label={label} title={label} onClick={start}>
        <Icon name={isToday ? 'play' : 'day'} size={14} />
      </button>
      <span className="f-row-time">{fmtDuration(item.minutes)}</span>
      <span className="f-row-title">
        {item.title}
        {item.tags?.map((tag) => <TagChip key={tag} tag={tag} />)}
      </span>
      <span className="f-row-meta">
        {item.label && <LabelTag label={item.label} iconOnly />}
        <button
          type="button"
          className="iconbtn f-row-more"
          aria-label={t('stack.more', { title: item.title })}
          aria-haspopup="menu"
          onClick={(e: MouseEvent<HTMLButtonElement>) => {
            const r = e.currentTarget.getBoundingClientRect();
            onMenu({ x: r.right - 240, y: r.bottom + 4, label: item.title, items: stackItemMenu(item) });
          }}
        >
          <Icon name="more" size={16} />
        </button>
      </span>
    </li>
  );
}

