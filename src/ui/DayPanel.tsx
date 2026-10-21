import { useState, type CSSProperties, type KeyboardEvent } from 'react';
import { colorOf } from '../domain/colors';
import { addDays, dayDiff, hm, overlapsDay, sameDay, ymd } from '../domain/dates';
import { countTasks, toggleTaskLine } from '../domain/markdown/tasks';
import { parseQuickAdd } from '../domain/quickAdd';
import { labelFor, matchesFilter } from '../domain/labels';
import type { Task } from '../domain/types';
import { fmtDate, t, type MsgKey } from '../i18n';
import { planner, usePlanner } from '../state/planner';
import { DoneButton } from './DoneButton';
import { useNow } from './hooks';
import { Icon } from './Icon';
import { isImeKey } from './ime';
import { LabelTag } from './LabelTag';
import { MarkdownView } from './MarkdownView';

export const QUICK_ADD_ID = 'quick-add';

const RELATIVE: Record<number, MsgKey> = { [-1]: 'day.yesterday', 0: 'day.today', 1: 'day.tomorrow' };

/** "Today", "Tomorrow", "Yesterday" or the weekday name. */
export function dayName(d: Date, now: Date): string {
  const rel = RELATIVE[dayDiff(now, d)];
  return rel ? t(rel) : fmtDate(d, { weekday: 'long' });
}

/** "09:00 – 10:30" for the part of a timed task that falls on `day`; empty for all-day tasks. */
function timeRange(task: Task, day: Date): string {
  if (task.allDay) return '';
  const from = task.start >= day ? hm(task.start) : '';
  const to = task.end <= addDays(day, 1) ? hm(task.end) : '';
  if (from && to) return `${from} – ${to}`;
  if (from) return t('time.from', { t: from });
  return to ? t('time.until', { t: to }) : '';
}

/** Open tasks first (by start), finished ones last. */
const byFocus = (a: Task, b: Task) => Number(a.done) - Number(b.done) || a.start.getTime() - b.start.getTime();

const onActivate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    fn();
  }
};

/** The selected day as a to-do list: the task to work on now, the rest of the day, and quick add. */
export function DayPanel({ onOpen, onEdit }: { onOpen: (id: string) => void; onEdit: (id: string) => void }) {
  const { day, tasks: all, sync, filter } = usePlanner();
  const tasks = all.filter((task) => matchesFilter(task, filter));
  const now = useNow();
  const items = tasks.filter((task) => overlapsDay(task, day)).sort(byFocus);
  const done = items.filter((task) => task.done);
  const [current, ...later] = items.filter((task) => !task.done);

  return (
    <aside className="panel" aria-label={t('panel.label')}>
      <div className="panel-head">
        <p className="panel-date">{fmtDate(day, { month: 'long', day: 'numeric', weekday: 'short' })}</p>
        <h2 className="panel-title">{dayName(day, now)}</h2>
        {items.length > 0 && <Progress done={done.length} total={items.length} />}
      </div>

      <div className="panel-body" data-day={ymd(day)}>
        {current ? (
          <Current task={current} day={day} now={now} onOpen={onOpen} onEdit={onEdit} />
        ) : (
          sync !== 'loading' && (
            <div className="pempty">
              <p className="pempty-title">{t(items.length ? 'panel.allDone' : 'panel.empty')}</p>
              <p>{t(items.length ? 'panel.allDoneHint' : 'panel.emptyHint')}</p>
            </div>
          )
        )}

        {later.length > 0 && (
          <section aria-labelledby="later-h">
            <h3 id="later-h" className="psection">
              {t('panel.later')}
            </h3>
            <ul className="plist">
              {later.map((task) => (
                <Row key={task.id} task={task} day={day} onOpen={onOpen} />
              ))}
            </ul>
          </section>
        )}

        <QuickAdd day={day} />

        {done.length > 0 && (
          <details className="pdone">
            <summary className="psection">{t('panel.completed', { n: done.length })}</summary>
            <ul className="plist">
              {done.map((task) => (
                <Row key={task.id} task={task} day={day} onOpen={onOpen} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </aside>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div className="pprogress">
      <div className="pbar" role="progressbar" aria-label={t('panel.progressLabel')} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <i style={{ width: `${(done / total) * 100}%` }} />
      </div>
      <span>{t('panel.progress', { done, total })}</span>
    </div>
  );
}

interface CurrentProps {
  task: Task;
  day: Date;
  now: Date;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
}

function Current({ task, day, now, onOpen, onEdit }: CurrentProps) {
  const range = timeRange(task, day);
  const started = sameDay(day, now) && task.start <= now;
  const { t: total, d: dn } = countTasks(task.description);
  return (
    <article className="pcurrent" data-id={task.id} style={{ '--c': colorOf(task.colorId) } as CSSProperties} aria-labelledby="current-h">
      <div className="pcurrent-meta">
        <span className="plabel">{t(started ? 'panel.now' : 'panel.next')}</span>
        {range && <span>{range}</span>}
        {total > 0 && <span>{t('panel.steps', { done: dn, total })}</span>}
        {task.label && <LabelTag label={task.label} />}
      </div>
      <h3 id="current-h" className="pcurrent-title" tabIndex={0} onClick={() => onOpen(task.id)} onKeyDown={onActivate(() => onOpen(task.id))}>
        {task.title}
      </h3>
      {task.description.trim() && (
        <div className="pnotes">
          <MarkdownView
            source={task.description}
            onToggle={(line) => void planner.patch(task.id, { description: toggleTaskLine(task.description, line) })}
          />
        </div>
      )}
      <div className="pcurrent-actions">
        <button type="button" className="btn primary" onClick={() => void planner.toggleDone(task.id)}>
          <Icon name="check" size={16} />
          {t('panel.markDone')}
        </button>
        <button type="button" className="btn ghost" onClick={() => onEdit(task.id)}>
          {t('panel.edit')}
        </button>
      </div>
    </article>
  );
}

function Row({ task, day, onOpen }: { task: Task; day: Date; onOpen: (id: string) => void }) {
  const { t: total, d: dn } = countTasks(task.description);
  return (
    <li
      className={'prow' + (task.done ? ' done' : '')}
      data-id={task.id}
      style={{ '--c': colorOf(task.colorId) } as CSSProperties}
      tabIndex={0}
      onClick={() => onOpen(task.id)}
      onKeyDown={onActivate(() => onOpen(task.id))}
    >
      <DoneButton task={task} />
      <span className="ptitle">{task.title}</span>
      <span className="pmeta">
        {task.label && <LabelTag label={task.label} iconOnly />}
        {total > 0 && <span>{`${dn}/${total}`}</span>}
        <span>{timeRange(task, day)}</span>
      </span>
    </li>
  );
}

function QuickAdd({ day }: { day: Date }) {
  const [text, setText] = useState('');
  const add = () => {
    const task = parseQuickAdd(text, day);
    if (!task) return;
    void planner.create({ ...task, label: labelFor(planner.get().filter) });
    setText('');
  };
  return (
    <div className="padd">
      <Icon name="plus" />
      <input
        id={QUICK_ADD_ID}
        type="text"
        placeholder={t('panel.addPlaceholder')}
        aria-label={t('panel.addLabel')}
        aria-keyshortcuts="n"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isImeKey(e)) add();
          else if (e.key === 'Escape') e.currentTarget.blur();
        }}
      />
    </div>
  );
}
