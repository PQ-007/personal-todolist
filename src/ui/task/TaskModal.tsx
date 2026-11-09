import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { applyDateHint, parseDateHint } from '../../domain/dateHint';
import { toggleTaskLine } from '../../domain/markdown/tasks';
import { DEFAULT_MINUTES } from '../../domain/stack';
import { isMultiDay, rangeFromForm, type WhenForm } from '../../domain/when';
import { t as tr } from '../../i18n';
import { planner } from '../../state/planner';
import { confirmDialog } from '../common/confirm';
import { Dialog } from '../common/Dialog';
import { isImeKey } from '../common/ime';
import { DateHintBar } from './DateHintBar';
import { initialDraft, withTemplate, type Draft, type ModalTarget } from './draft';
import { LabelPicker } from './LabelPicker';
import { NotesTabs } from './NotesTabs';
import { deleteTask } from './recurring';
import { RepeatDialog } from './RepeatDialog';
import { saveDraft } from './saveDraft';
import { TaskHead } from './TaskHead';
import { ReminderSelect, RepeatSelect, TodoLength } from './TaskOptions';
import { TemplateButton } from './TemplateButton';
import { useRepeat } from './useRepeat';
import { WhenRow } from './WhenRow';

export type { ModalTarget } from './draft';

/**
 * Adding or editing a task (or adding a to-do). Holds the form; its parts are in this folder,
 * saving is `saveDraft`. Closing with unsaved changes asks first.
 */
export function TaskModal({ target, onClose }: { target: ModalTarget; onClose: () => void }) {
  const [{ task, draft: start }] = useState(() => initialDraft(target, planner.find));
  const [draft, setDraft] = useState<Draft>(start);
  const [dirty, setDirty] = useState(false);
  const [showEnd, setShowEnd] = useState(() => isMultiDay(start.when));
  const titleRef = useRef<HTMLInputElement>(null);
  const isNew = !task;
  // A new entry is either a calendar task or a to-do for the stack; one dialog adds both.
  const [todo, setTodo] = useState(target.kind === 'new' && !!target.todo);
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const repeat = useRepeat(task);
  const [customOpen, setCustomOpen] = useState(false);
  // "Gym tomorrow 7pm": a date in a new task's title is offered until dismissed.
  const [hintsOff, setHintsOff] = useState(false);
  const hint = isNew && !todo && !hintsOff ? parseDateHint(draft.title, new Date()) : null;
  const hintForm = hint && applyDateHint(draft.when, hint);

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

  const save = () =>
    saveDraft(
      // A date hint still showing is taken as meant.
      { task, draft: hint ? { ...draft, title: hint.title, when: applyDateHint(draft.when, hint) } : draft, todo, minutes, repeat },
      onClose,
      () => titleRef.current?.focus(),
    );

  /** Ticking a checklist item saves at once (unless the task is new). */
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

  const startAt = rangeFromForm(draft.when).start;
  const repeatFrom = Number.isNaN(startAt.getTime()) ? new Date() : startAt;

  return (
    <>
      {customOpen && (
        <RepeatDialog
          start={repeatFrom}
          initial={repeat.repeat}
          onDone={(r) => {
            repeat.setRepeat(r);
            setDirty(true);
            setCustomOpen(false);
          }}
          onCancel={() => setCustomOpen(false)}
        />
      )}
      <Dialog label={tr(isNew ? 'modal.new' : 'modal.details')} onRequestClose={requestClose}>
        <div className="mwrap" onKeyDown={onKeyDown}>
          <TaskHead
            isNew={isNew}
            todo={todo}
            onTodo={setTodo}
            colorId={draft.colorId}
            onColor={(colorId) => change({ colorId })}
            done={draft.done}
            onDone={(done) => change({ done })}
            onClose={requestClose}
          />

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

          {hint && hintForm && (
            <DateHintBar
              form={hintForm}
              timed={!!hint.start}
              onUse={() => {
                change({ title: hint.title, when: hintForm });
                titleRef.current?.focus();
              }}
              onIgnore={() => setHintsOff(true)}
            />
          )}

          {todo ? (
            <TodoLength
              minutes={minutes}
              onChange={(m) => {
                setMinutes(m);
                setDirty(true);
              }}
            />
          ) : (
            <>
              <WhenRow when={draft.when} onChange={changeWhen} showEnd={showEnd} onShowEnd={setShowEnd} />
              <div className="mopts">
                <RepeatSelect
                  repeat={repeat.repeat}
                  from={repeatFrom}
                  disabled={!repeat.ready}
                  onChange={(r) => {
                    repeat.setRepeat(r);
                    setDirty(true);
                  }}
                  onCustom={() => setCustomOpen(true)}
                />
                <ReminderSelect reminders={draft.reminders} allDay={draft.when.allDay} onChange={(reminders) => change({ reminders })} />
              </div>
            </>
          )}

          <LabelPicker value={draft.label} onChange={(label) => change({ label })} />

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

          <NotesTabs value={draft.description} onChange={(description) => change({ description })} onToggle={toggleLine} />

          <div className="mfoot">
            <TemplateButton
              draft={draft}
              onApply={(tpl) => {
                setDraft((d) => withTemplate(d, tpl));
                setDirty(true);
              }}
            />
            {task && (
              <button type="button" className="btn danger ghost" onClick={() => void deleteTask(task.id, onClose)}>
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
