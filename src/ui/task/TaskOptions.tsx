import { presetOf, presets, type Repeat } from '../../domain/recurrence';
import { LENGTHS } from '../../domain/stack';
import { fmtDuration, t as tr } from '../../i18n';
import { Icon } from '../common/Icon';
import { ALL_DAY_REMINDERS, reminderText, remindersText, TIMED_REMINDERS } from './reminderText';
import { describeRepeat } from './repeatText';

/** A to-do's length, in place of a date and time. */
export function TodoLength({ minutes, onChange }: { minutes: number; onChange: (minutes: number) => void }) {
  return (
    <div className="mwhen mtodo">
      <label className="mrepeat">
        <Icon name="clock" size={16} />
        <span className="sr-only">{tr('add.length')}</span>
        <select value={minutes} onChange={(e) => onChange(Number(e.target.value))}>
          {LENGTHS.map((m) => (
            <option key={m} value={m}>
              {fmtDuration(m)}
            </option>
          ))}
        </select>
      </label>
      <span className="mtodo-hint">{tr('add.todoHint')}</span>
    </div>
  );
}

/**
 * How a task repeats, from Google Calendar's presets for a task starting `from`, or a custom
 * rule (`onCustom` opens its dialog). A rule that's no preset shows as itself.
 */
export function RepeatSelect({
  repeat,
  from,
  disabled,
  onChange,
  onCustom,
}: {
  repeat: Repeat | null;
  from: Date;
  disabled: boolean;
  onChange: (repeat: Repeat | null) => void;
  onCustom: () => void;
}) {
  const value = presetOf(repeat, from) ?? 'current';
  return (
    <label className="mrepeat">
      <Icon name="repeat" size={16} />
      <span className="sr-only">{tr('rep.label')}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const id = e.target.value;
          if (id === 'custom') return onCustom();
          if (id === 'current') return;
          onChange(presets(from).find((p) => p.id === id)?.repeat ?? null);
        }}
      >
        {presets(from).map((p) => (
          <option key={p.id} value={p.id}>
            {describeRepeat(p.repeat, from)}
          </option>
        ))}
        {value === 'current' && <option value="current">{describeRepeat(repeat, from)}</option>}
        <option value="custom">{tr('rep.custom')}</option>
      </select>
    </label>
  );
}

/** A task's reminder: the calendar's default, none, or one of the usual times before it. */
export function ReminderSelect({ reminders, allDay, onChange }: { reminders?: number[]; allDay: boolean; onChange: (reminders: number[] | undefined) => void }) {
  const choices = allDay ? ALL_DAY_REMINDERS : TIMED_REMINDERS;
  const rem = reminders;
  const value = !rem ? 'default' : !rem.length ? 'none' : rem.length === 1 && choices.includes(rem[0]!) ? String(rem[0]) : 'current';
  return (
    <label className="mrepeat">
      <Icon name="bell" size={16} />
      <span className="sr-only">{tr('rem.label')}</span>
      <select
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'current') return;
          onChange(v === 'default' ? undefined : v === 'none' ? [] : [Number(v)]);
        }}
      >
        <option value="default">{tr('rem.default')}</option>
        <option value="none">{tr('rem.none')}</option>
        {choices.map((m) => (
          <option key={m} value={m}>
            {reminderText(m, allDay)}
          </option>
        ))}
        {value === 'current' && <option value="current">{remindersText(rem, allDay)}</option>}
      </select>
    </label>
  );
}
