import { parseYmd } from '../../domain/dates';
import type { WhenForm } from '../../domain/when';
import { fmtDate, t as tr } from '../../i18n';
import { Icon } from '../common/Icon';

/** "Gym tomorrow 7pm": offers the date (and time, `timed`) found in a new task's title. */
export function DateHintBar({ form, timed, onUse, onIgnore }: { form: WhenForm; timed: boolean; onUse: () => void; onIgnore: () => void }) {
  return (
    <div className="mhint" role="status">
      <Icon name="magic" size={15} />
      <span>
        {fmtDate(parseYmd(form.startDate), { weekday: 'short', month: 'short', day: 'numeric' })}
        {timed && ` · ${form.startTime}–${form.endTime}`}
      </span>
      <button type="button" className="linkbtn" onClick={onUse}>
        {tr('hint.use')}
      </button>
      <button type="button" className="linkbtn muted" onClick={onIgnore}>
        {tr('hint.ignore')}
      </button>
    </div>
  );
}
