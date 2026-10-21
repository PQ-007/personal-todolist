import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { COLORS, COLOR_NAMES, DEFAULT_COLOR } from '../domain/colors';
import { addMin } from '../domain/dates';
import { countTasks, toggleTaskLine } from '../domain/markdown/tasks';
import { LABELS, type Label } from '../domain/labels';
import { formatTags, parseTagField } from '../domain/tags';
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
import { t as tr } from '../i18n';
import { planner } from '../state/planner';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { isImeKey } from './ime';
import { MarkdownEditor } from './MarkdownEditor';
import { MarkdownView } from './MarkdownView';
import { Rich } from './Rich';

export type ModalTarget = { kind: 'view'; id: string } | { kind: 'edit'; id: string } | { kind: 'new'; start: Date; label?: Label };

interface Draft {
  title: string;
  description: string;
  colorId: string;
  label?: Label;
  /** Tags as typed: "#report #urgent". */
  tagsText: string;
  done: boolean;
  when: WhenForm;
}

function initial(target: ModalTarget): { task: Task | null; draft: Draft } {
  if (target.kind === 'edit') {
    const t = planner.find(target.id);
    if (t) {
      return {
        task: t,
        draft: { title: t.title, description: t.description, colorId: t.colorId, label: t.label, tagsText: formatTags(t.tags), done: t.done, when: formFromTask(t) },
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
      label: target.kind === 'new' ? target.label : undefined,
      tagsText: '',
      done: false,
      when: formFromTask({ start, end: addMin(start, 60), allDay: false }),
    },
  };
}

export function TaskModal({ target, onClose }: { target: ModalTarget; onClose: () => void }) {
  const [{ task, draft: start }] = useState(() => initial(target));
  const [draft, setDraft] = useState<Draft>(start);
  const [tab, setTab] = useState<'view' | 'edit'>('edit');
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
    if (!dirty || confirm(tr('modal.discard'))) onClose();
  };

  const save = () => {
    const title = draft.title.trim();
    if (!title) {
      planner.toast(tr('modal.needTitle'));
      titleRef.current?.focus();
      return;
    }
    const range = rangeFromForm(draft.when);
    const err = validateRange(range);
    if (err) {
      planner.toast(tr(err));
      return;
    }
    const fields = { title, description: draft.description, colorId: draft.colorId, label: draft.label, tags: parseTagField(draft.tagsText), done: draft.done, ...range };
    onClose();
    if (task) {
      const cur = planner.find(task.id) ?? task;
      void planner.update({ ...cur, ...fields });
    } else void planner.create(fields);
  };

  const remove = () => {
    if (!task) return;
    onClose();
    planner.deleteWithUndo(task.id);
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
    <Dialog label={tr(isNew ? 'modal.new' : 'modal.details')} onRequestClose={requestClose}>
      <div className="mwrap" onKeyDown={onKeyDown}>
        <div className="mhead">
          <div className="swatches" role="radiogroup" aria-label={tr('modal.color')}>
            {Object.entries(COLORS).map(([k, c]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={k === draft.colorId}
                className={'sw' + (k === draft.colorId ? ' on' : '')}
                style={{ '--c': c } as CSSProperties}
                aria-label={tr(COLOR_NAMES[k]!)}
                onClick={() => change({ colorId: k })}
              />
            ))}
          </div>
          <label className="donechk">
            <input type="checkbox" checked={draft.done} onChange={(e) => change({ done: e.target.checked })} /> {tr('modal.done')}
          </label>
          <button type="button" className="x" aria-label={tr('modal.close')} onClick={requestClose}>
            <Icon name="x" />
          </button>
        </div>

        <input
          ref={titleRef}
          className="mtitle"
          placeholder={tr('modal.titlePlaceholder')}
          aria-label={tr('modal.title')}
          value={draft.title}
          autoComplete="off"
          onChange={(e) => change({ title: e.target.value })}
        />

        <div className="mwhen">
          <input
            type="date"
            aria-label={tr(endVisible ? 'modal.startDate' : 'modal.date')}
            value={w.startDate}
            onChange={(e) => changeWhen((f) => setStartDate(f, e.target.value))}
          />
          {!w.allDay && (
            <span className="timebox">
              <input
                type="time"
                aria-label={tr('modal.startTime')}
                value={w.startTime}
                onChange={(e) => changeWhen((f) => ({ ...f, startTime: e.target.value }))}
              />
              –
            </span>
          )}
          {endVisible && (
            <span className="enddate">
              {w.allDay && tr('modal.to')}
              <input
                type="date"
                aria-label={tr('modal.endDate')}
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
                aria-label={tr('modal.endTime')}
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
            {tr('modal.allDay')}
          </label>
          {!endVisible && (
            <button type="button" className="linkbtn" onClick={() => setShowEnd(true)}>
              {tr(w.allDay ? 'modal.severalDays' : 'modal.endsAnotherDay')}
            </button>
          )}
        </div>

        <div className="mlabel" role="radiogroup" aria-label={tr('label.field')}>
          {[undefined, ...LABELS].map((l) => (
            <button
              key={l ?? 'none'}
              type="button"
              role="radio"
              aria-checked={draft.label === l}
              className={'lblopt' + (l ? ' ' + l : '') + (draft.label === l ? ' on' : '')}
              onClick={() => change({ label: l })}
            >
              {l && <Icon name={l} size={14} />}
              {tr(l === 'work' ? 'label.work' : l === 'personal' ? 'label.personal' : 'label.none')}
            </button>
          ))}
        </div>

        <label className="mtags">
          <span>{tr('tags.label')}</span>
          <input
            type="text"
            value={draft.tagsText}
            placeholder={tr('tags.placeholder')}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => change({ tagsText: e.target.value })}
          />
        </label>

        <div className="tabs" role="tablist">
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
            {tr('modal.editMarkdown')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'view'}
            className={'tab' + (tab === 'view' ? ' on' : '')}
            onClick={() => setTab('view')}
          >
            {tr('modal.notes')}
          </button>
          {t > 0 && (
            <div className="prog" aria-label={tr('modal.checklistProgress', { done: d, total: t })}>
              <span>
                <i style={{ width: `${Math.round((d / t) * 100)}%` }} />
              </span>
              {tr('modal.doneCount', { done: d, total: t })}
            </div>
          )}
        </div>

        <div className="mbody" role="tabpanel">
          {tab === 'view' ? (
            draft.description.trim() ? (
              <MarkdownView source={draft.description} onToggle={toggleLine} />
            ) : (
              <p className="empty">
                <Rich text={tr('modal.noNotes')} parts={{ code: <code>- [ ] item</code> }} />
              </p>
            )
          ) : (
            <MarkdownEditor value={draft.description} onChange={(description) => change({ description })} />
          )}
        </div>

        <div className="mfoot">
          {!isNew && (
            <button type="button" className="btn danger ghost" onClick={remove}>
              {tr('modal.delete')}
            </button>
          )}
          <span className="hint">{tr('modal.saveHint')}</span>
          <button type="button" className="btn" onClick={requestClose}>
            {tr('modal.cancel')}
          </button>
          <button type="button" className="btn primary" onClick={save}>
            {tr('modal.save')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
