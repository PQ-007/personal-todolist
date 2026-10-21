import { useEffect, type CSSProperties, type KeyboardEvent } from 'react';
import { colorOf } from '../domain/colors';
import { addDays, addMin, hm, sameDay } from '../domain/dates';
import { countTasks, toggleTaskLine } from '../domain/markdown/tasks';
import type { Task } from '../domain/types';
import { fmtDate, fmtDuration, t } from '../i18n';
import { planner, usePlanner } from '../state/planner';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { LabelTag } from './LabelTag';
import { isTyping, shortcutKey } from './keys';
import { MarkdownView } from './MarkdownView';
import { TagChip } from './TagChip';

const DATE: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };

const duration = (t0: Date, t1: Date) => fmtDuration(Math.round((t1.getTime() - t0.getTime()) / 60000));

/** "Wednesday, October 21 · 09:30 – 11:00 · 1h 30m", or the all-day / multi-day equivalents. */
function whenText(task: Task): string {
  if (task.allDay) {
    const last = addDays(task.end, -1);
    const days = sameDay(task.start, last) ? fmtDate(task.start, DATE) : `${fmtDate(task.start, DATE)} – ${fmtDate(last, DATE)}`;
    return `${days} · ${t('modal.allDay')}`;
  }
  const len = duration(task.start, task.end);
  // An end at midnight still belongs to the start day.
  if (sameDay(task.start, addMin(task.end, -1))) return `${fmtDate(task.start, DATE)} · ${hm(task.start)} – ${hm(task.end)} · ${len}`;
  return `${fmtDate(task.start, DATE)} ${hm(task.start)} – ${fmtDate(task.end, DATE)} ${hm(task.end)} · ${len}`;
}

/** The read view of a task: big title, when, label, checklist progress and live notes. */
export function TaskView({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: () => void }) {
  usePlanner();
  const task = planner.find(id);

  useEffect(() => {
    if (!task) onClose();
  }, [task, onClose]);
  if (!task) return null;

  const { t: total, d: done } = countTasks(task.description);
  const pct = total ? Math.round((done / total) * 100) : 0;

  const onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e.target) || (e.target as Element).closest('a') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (shortcutKey(e.nativeEvent) === 'e') {
      e.preventDefault();
      onEdit();
    } else if (e.key === 'Delete') {
      e.preventDefault();
      onClose();
      planner.deleteWithUndo(task.id);
    }
  };

  return (
    <Dialog label={task.title} onRequestClose={onClose} className="tview">
      <div className={'tv' + (task.done ? ' isdone' : '')} style={{ '--c': colorOf(task.colorId) } as CSSProperties} onKeyDown={onKeyDown}>
        <header className="tv-head">
          <div className="tv-bar">
            {task.label && <LabelTag label={task.label} />}
            {task.tags?.map((tag) => <TagChip key={tag} tag={tag} />)}
            {task.done && (
              <span className="tv-donetag">
                <Icon name="check" size={13} />
                {t('modal.done')}
              </span>
            )}
            <span className="sp" />
            <button type="button" className="iconbtn" aria-label={t('menu.edit')} title={`${t('menu.edit')} (E)`} onClick={onEdit}>
              <Icon name="edit" />
            </button>
            <button type="button" className="iconbtn" aria-label={t('menu.duplicate')} title={t('menu.duplicate')} onClick={() => planner.duplicate(task.id)}>
              <Icon name="duplicate" />
            </button>
            <button type="button" className="iconbtn" aria-label={t('menu.copy')} title={t('menu.copy')} onClick={() => planner.copy(task.id)}>
              <Icon name="copy" />
            </button>
            <button
              type="button"
              className="iconbtn danger"
              aria-label={t('menu.delete')}
              title={t('menu.delete')}
              onClick={() => {
                onClose();
                planner.deleteWithUndo(task.id);
              }}
            >
              <Icon name="trash" />
            </button>
            <button type="button" className="iconbtn" aria-label={t('modal.close')} title={t('modal.close')} onClick={onClose}>
              <Icon name="x" />
            </button>
          </div>
          <h2 className="tv-title">{task.title}</h2>
          <p className="tv-when">
            <Icon name="clock" size={16} />
            {whenText(task)}
          </p>
        </header>

        <div className="tv-body">
          {total > 0 && (
            <div className="tv-progress">
              <div className="tv-progress-row">
                <span>{t('panel.steps', { done, total })}</span>
                <span>{pct}%</span>
              </div>
              <div className="pbar" role="progressbar" aria-label={t('panel.progressLabel')} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
                <i style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
          {task.description.trim() ? (
            <div className="tv-notes">
              <MarkdownView
                source={task.description}
                onToggle={(line) => void planner.patch(task.id, { description: toggleTaskLine(task.description, line) })}
              />
            </div>
          ) : (
            <p className="tv-empty">{t('view.noNotes')}</p>
          )}
        </div>

        <footer className="tv-foot">
          <button type="button" className="btn ghost" onClick={onEdit}>
            <Icon name="edit" size={16} />
            {t('menu.edit')}
          </button>
          <span className="sp" />
          <button type="button" className={'btn' + (task.done ? '' : ' primary')} onClick={() => void planner.toggleDone(task.id)}>
            <Icon name={task.done ? 'x' : 'check'} size={16} />
            {t(task.done ? 'menu.markUndone' : 'panel.markDone')}
          </button>
        </footer>
      </div>
    </Dialog>
  );
}
