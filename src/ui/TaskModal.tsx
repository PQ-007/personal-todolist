import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { COLORS, COLOR_NAMES, DEFAULT_COLOR } from '../domain/colors';
import { addMin } from '../domain/dates';
import { countTasks, toggleTaskLine } from '../domain/markdown/tasks';
import { LABELS, type Label } from '../domain/labels';
import { parseRule, presetOf, presets, ruleLine, type Repeat } from '../domain/recurrence';
import { DEFAULT_MINUTES, LENGTHS } from '../domain/stack';
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
import { fmtDuration, t as tr } from '../i18n';
import { planner } from '../state/planner';
import { confirmDialog } from './confirm';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { isImeKey } from './ime';
import { MarkdownView } from './MarkdownView';
import { askScope, repeats } from './recurring';
import { RepeatDialog } from './RepeatDialog';
import { describeRepeat } from './repeatText';
import { Rich } from './Rich';

// CodeMirror is only needed once a task is being edited.
const MarkdownEditor = lazy(() => import('./MarkdownEditor'));

export type ModalTarget =
  | { kind: 'view'; id: string }
  | { kind: 'edit'; id: string }
  /** `todo`: start as a to-do (no time, goes to the stack) rather than a calendar task. */
  | { kind: 'new'; start: Date; label?: Label; todo?: boolean };

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
  // A new entry is either a calendar task or a to-do for the stack; one dialog adds both.
  const [todo, setTodo] = useState(target.kind === 'new' && !!target.todo);
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  // How it repeats. An occurrence doesn't carry its series' rule, so that is loaded first.
  const [{ repeat0, lines0 }] = useState(() => ({ repeat0: parseRule(task?.recurrence), lines0: task?.recurrence }));
  const [repeat, setRepeat] = useState<Repeat | null>(repeat0);
  const [orig, setOrig] = useState({ repeat: repeat0, lines: lines0, ready: !task?.seriesId });
  const [customOpen, setCustomOpen] = useState(false);

  useEffect(() => {
    if (!task?.seriesId) return;
    let live = true;
    void planner.seriesOf(task).then((series) => {
      if (!live) return;
      const r = parseRule(series?.recurrence);
      setRepeat(r);
      setOrig({ repeat: r, lines: series?.recurrence, ready: true });
    });
    return () => {
      live = false;
    };
  }, [task]);

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
    if (!dirty) return onClose();
    void confirmDialog({
      title: tr('confirm.discardTitle'),
      message: tr('confirm.discardBody'),
      confirmLabel: tr('confirm.discard'),
      cancelLabel: tr('confirm.keepEditing'),
      danger: true,
    }).then((ok) => ok && onClose());
  };

  /** The RRULE lines to save; an unchanged rule is kept exactly as stored (it may have parts we can't edit). */
  const recurrenceLines = (allDay: boolean) => (!repeat ? undefined : repeat === orig.repeat && orig.lines ? orig.lines : [ruleLine(repeat, allDay)]);

  const save = async () => {
    const title = draft.title.trim();
    if (!title) {
      planner.toast(tr('modal.needTitle'));
      titleRef.current?.focus();
      return;
    }
    if (todo) {
      onClose();
      const { colorId, label, description } = draft;
      planner.addStackItem({ title, description, colorId, label, tags: parseTagField(draft.tagsText), minutes });
      // Show where it went.
      if (planner.get().mode === 'plan') planner.setStackOpen(true);
      return;
    }
    const range = rangeFromForm(draft.when);
    const err = validateRange(range);
    if (err) {
      planner.toast(tr(err));
      return;
    }
    const fields = { title, description: draft.description, colorId: draft.colorId, label: draft.label, tags: parseTagField(draft.tagsText), done: draft.done, ...range };
    const recurrence = recurrenceLines(range.allDay);
    if (!task) {
      onClose();
      void planner.create({ ...fields, recurrence });
      return;
    }
    const cur = planner.find(task.id) ?? task;
    if (repeats(cur)) {
      if (!orig.ready) return;
      // A new rule can only apply to the whole series.
      const scope = await askScope('edit', repeat === orig.repeat);
      if (!scope) return;
      onClose();
      if (scope === 'this') void planner.update({ ...cur, ...fields });
      else void planner.updateSeries(cur, fields, recurrence);
      return;
    }
    onClose();
    // A task that starts repeating becomes a series; reload to show its occurrences.
    if (recurrence) void planner.update({ ...cur, ...fields, recurrence }).then(() => planner.refresh());
    else void planner.update({ ...cur, ...fields });
  };

  const remove = async () => {
    if (!task) return;
    if (!repeats(task)) {
      onClose();
      planner.deleteWithUndo(task.id);
      return;
    }
    const scope = await askScope('delete');
    if (!scope) return;
    onClose();
    if (scope === 'this') planner.deleteWithUndo(task.id);
    else void planner.deleteSeries(task);
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
      void save();
    }
  };

  const { t, d } = countTasks(draft.description);
  const w = draft.when;
  const endVisible = showEnd || isMultiDay(w);
  const startAt = rangeFromForm(w).start;
  const repeatFrom = Number.isNaN(startAt.getTime()) ? new Date() : startAt;
  const repeatValue = presetOf(repeat, repeatFrom) ?? 'current';

  return (
    <>
      {customOpen && (
        <RepeatDialog
          start={repeatFrom}
          initial={repeat}
          onDone={(r) => {
            setRepeat(r);
            setDirty(true);
            setCustomOpen(false);
          }}
          onCancel={() => setCustomOpen(false)}
        />
      )}
      <Dialog label={tr(isNew ? 'modal.new' : 'modal.details')} onRequestClose={requestClose}>
        <div className="mwrap" onKeyDown={onKeyDown}>
          <div className="mhead">
            {isNew && (
              <div className="segmented mkind" role="radiogroup" aria-label={tr('add.kind')}>
                {([false, true] as const).map((isTodo) => (
                  <button
                    key={String(isTodo)}
                    type="button"
                    role="radio"
                    aria-checked={todo === isTodo}
                    className={'seg-opt' + (todo === isTodo ? ' on' : '')}
                    onClick={() => setTodo(isTodo)}
                  >
                    <Icon name={isTodo ? 'inbox' : 'clock'} size={16} />
                    {tr(isTodo ? 'add.todo' : 'add.event')}
                  </button>
                ))}
              </div>
            )}
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
            {!isNew && (
              <label className="donechk">
                <input type="checkbox" checked={draft.done} onChange={(e) => change({ done: e.target.checked })} /> {tr('modal.done')}
              </label>
            )}
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
            onKeyDown={(e) => {
              // Enter saves straight from the title (Ctrl/⌘+Enter is handled for the whole dialog).
              if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !isImeKey(e)) {
                e.preventDefault();
                void save();
              }
            }}
          />

          {todo ? (
            <div className="mwhen mtodo">
              <label className="mrepeat">
                <Icon name="clock" size={16} />
                <span className="sr-only">{tr('add.length')}</span>
                <select
                  value={minutes}
                  onChange={(e) => {
                    setMinutes(Number(e.target.value));
                    setDirty(true);
                  }}
                >
                  {LENGTHS.map((m) => (
                    <option key={m} value={m}>
                      {fmtDuration(m)}
                    </option>
                  ))}
                </select>
              </label>
              <span className="mtodo-hint">{tr('add.todoHint')}</span>
            </div>
          ) : (
            <>
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

          <label className="mrepeat">
            <Icon name="repeat" size={16} />
            <span className="sr-only">{tr('rep.label')}</span>
            <select
              value={repeatValue}
              disabled={!orig.ready}
              onChange={(e) => {
                const id = e.target.value;
                if (id === 'custom') return setCustomOpen(true);
                if (id === 'current') return;
                setRepeat(presets(repeatFrom).find((p) => p.id === id)?.repeat ?? null);
                setDirty(true);
              }}
            >
              {presets(repeatFrom).map((p) => (
                <option key={p.id} value={p.id}>
                  {describeRepeat(p.repeat, repeatFrom)}
                </option>
              ))}
              {repeatValue === 'current' && <option value="current">{describeRepeat(repeat, repeatFrom)}</option>}
              <option value="custom">{tr('rep.custom')}</option>
            </select>
          </label>
            </>
          )}

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
              <Suspense fallback={<div className="mdedit" />}>
                <MarkdownEditor value={draft.description} onChange={(description) => change({ description })} />
              </Suspense>
            )}
          </div>

          <div className="mfoot">
            {!isNew && (
              <button type="button" className="btn danger ghost" onClick={() => void remove()}>
                {tr('modal.delete')}
              </button>
            )}
            <span className="hint">{tr('modal.saveHint')}</span>
            <button type="button" className="btn" onClick={requestClose}>
              {tr('modal.cancel')}
            </button>
            <button type="button" className="btn primary" onClick={() => void save()}>
              {tr('modal.save')}
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
