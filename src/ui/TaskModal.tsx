import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { COLORS, COLOR_NAMES, DEFAULT_COLOR } from '../domain/colors';
import { addMin } from '../domain/dates';
import { countTasks, toggleTaskLine } from '../domain/markdown/tasks';
import type { Task } from '../domain/types';
import {
  formFromTask,
  isMultiDay,
  rangeFromForm,
  setAllDay,
  setStartDate,
  validateRange,
  type WhenForm,
} from '../domain/when';
import { planner } from '../state/planner';
import { Dialog } from './Dialog';
import { isImeKey } from './ime';
import { MarkdownEditor } from './MarkdownEditor';
import { MarkdownView } from './MarkdownView';

export type ModalTarget = { kind: 'edit'; id: string } | { kind: 'new'; start: Date };

interface Draft {
  title: string;
  description: string;
  colorId: string;
  done: boolean;
  when: WhenForm;
}

function initial(target: ModalTarget): { task: Task | null; draft: Draft } {
  if (target.kind === 'edit') {
    const t = planner.find(target.id);
    if (t) {
      return {
        task: t,
        draft: { title: t.title, description: t.description, colorId: t.colorId, done: t.done, when: formFromTask(t) },
      };
    }
  }
  const start = target.kind === 'new' ? target.start : new Date();
  return {
    task: null,
    draft: {
      title: '',
      description: '',
      colorId: DEFAULT_COLOR,
      done: false,
      when: formFromTask({ start, end: addMin(start, 60), allDay: false }),
    },
  };
}

export function TaskModal({ target, onClose }: { target: ModalTarget; onClose: () => void }) {
  const [{ task, draft: start }] = useState(() => initial(target));
  const [draft, setDraft] = useState<Draft>(start);
  const [tab, setTab] = useState<'view' | 'edit'>(task ? 'view' : 'edit');
  const [dirty, setDirty] = useState(false);
  const [showEnd, setShowEnd] = useState(() => isMultiDay(start.when));
  const titleRef = useRef<HTMLInputElement>(null);
  const isNew = !task;

  useEffect(() => {
    if (isNew) titleRef.current?.focus();
  }, [isNew]);

  const change = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const changeWhen = (fn: (w: WhenForm) => WhenForm) => {
    setDraft((d) => ({ ...d, when: fn(d.when) }));
    setDirty(true);
  };

  const requestClose = () => {
    if (!dirty || confirm('Discard your changes?')) onClose();
  };

  const save = () => {
    const title = draft.title.trim();
    if (!title) {
      planner.toast('Add a title first.');
      titleRef.current?.focus();
      return;
    }
    const range = rangeFromForm(draft.when);
    const err = validateRange(range);
    if (err) {
      planner.toast(err);
      return;
    }
    const fields = { title, description: draft.description, colorId: draft.colorId, done: draft.done, ...range };
    onClose();
    if (task) {
      const cur = planner.find(task.id) ?? task;
      void planner.update({ ...cur, ...fields });
    } else void planner.create(fields);
  };

  const remove = () => {
    if (task && confirm('Delete this task?')) {
      onClose();
      void planner.remove(task.id);
    }
  };

  const toggleLine = (line: number) => {
    const description = toggleTaskLine(draft.description, line);
    setDraft((d) => ({ ...d, description }));
    if (task) void planner.patch(task.id, { description });
    else setDirty(true);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isImeKey(e)) {
      e.preventDefault();
      save();
    }
  };

  const { t, d } = countTasks(draft.description);
  const w = draft.when;
  const endVisible = showEnd || isMultiDay(w);

  return (
    <Dialog label={isNew ? 'New task' : 'Task details'} onRequestClose={requestClose}>
      <div className="mwrap" onKeyDown={onKeyDown}>
        <div className="mhead">
          <div className="swatches" role="radiogroup" aria-label="Color">
            {Object.entries(COLORS).map(([k, c]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={k === draft.colorId}
                className={'sw' + (k === draft.colorId ? ' on' : '')}
                style={{ '--c': c } as CSSProperties}
                aria-label={COLOR_NAMES[k]}
                onClick={() => change({ colorId: k })}
              />
            ))}
          </div>
          <label className="donechk">
            <input type="checkbox" checked={draft.done} onChange={(e) => change({ done: e.target.checked })} /> Done
          </label>
          <button type="button" className="x" aria-label="Close" onClick={requestClose}>
            ×
          </button>
        </div>

        <input
          ref={titleRef}
          className="mtitle"
          placeholder="Task or event title"
          aria-label="Title"
          value={draft.title}
          autoComplete="off"
          onChange={(e) => change({ title: e.target.value })}
        />

        <div className="mwhen">
          <input
            type="date"
            aria-label={endVisible ? 'Start date' : 'Date'}
            value={w.startDate}
            onChange={(e) => changeWhen((f) => setStartDate(f, e.target.value))}
          />
          {!w.allDay && (
            <span className="timebox">
              <input
                type="time"
                aria-label="Start time"
                value={w.startTime}
                onChange={(e) => changeWhen((f) => ({ ...f, startTime: e.target.value }))}
              />
              –
            </span>
          )}
          {endVisible && (
            <span className="enddate">
              {w.allDay && 'to'}
              <input
                type="date"
                aria-label="End date"
                value={w.endDate}
                min={w.startDate}
                onChange={(e) => changeWhen((f) => ({ ...f, endDate: e.target.value }))}
              />
            </span>
          )}
          {!w.allDay && (
            <span className="timebox">
              <input
                type="time"
                aria-label="End time"
                value={w.endTime}
                onChange={(e) => changeWhen((f) => ({ ...f, endTime: e.target.value }))}
              />
            </span>
          )}
          <label>
            <input
              type="checkbox"
              checked={w.allDay}
              onChange={(e) => {
                changeWhen((f) => setAllDay(f, e.target.checked));
                setShowEnd(false);
              }}
            />{' '}
            All day
          </label>
          {!endVisible && (
            <button type="button" className="linkbtn" onClick={() => setShowEnd(true)}>
              {w.allDay ? 'Several days' : 'Ends another day'}
            </button>
          )}
        </div>

        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'view'}
            className={'tab' + (tab === 'view' ? ' on' : '')}
            onClick={() => setTab('view')}
          >
            Notes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'edit'}
            className={'tab' + (tab === 'edit' ? ' on' : '')}
            onClick={() => {
              setTab('edit');
              requestAnimationFrame(() => document.getElementById('m-desc')?.focus());
            }}
          >
            Edit markdown
          </button>
          {t > 0 && (
            <div className="prog" aria-label={`${d} of ${t} checklist items done`}>
              <span>
                <i style={{ width: `${Math.round((d / t) * 100)}%` }} />
              </span>
              {d}/{t} done
            </div>
          )}
        </div>

        <div className="mbody" role="tabpanel">
          {tab === 'view' ? (
            draft.description.trim() ? (
              <MarkdownView source={draft.description} onToggle={toggleLine} />
            ) : (
              <p className="empty">
                No notes yet. Open “Edit markdown” and type <code>- [ ] item</code> to add a checklist.
              </p>
            )
          ) : (
            <MarkdownEditor value={draft.description} onChange={(description) => change({ description })} />
          )}
        </div>

        <div className="mfoot">
          {!isNew && (
            <button type="button" className="btn danger ghost" onClick={remove}>
              Delete
            </button>
          )}
          <span className="hint">Ctrl/⌘ + Enter to save</span>
          <button type="button" className="btn" onClick={requestClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </Dialog>
  );
}
