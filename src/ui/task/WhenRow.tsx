import { isMultiDay, setAllDay, setStartDate, type WhenForm } from '../../domain/when';
import { t as tr } from '../../i18n';

/**
 * When a task is: its date, start and end times, all day or not. The end date shows only for
 * tasks over several days, or once asked for (`showEnd`).
 */
export function WhenRow({
  when: w,
  onChange,
  showEnd,
  onShowEnd,
}: {
  when: WhenForm;
  onChange: (fn: (w: WhenForm) => WhenForm) => void;
  showEnd: boolean;
  onShowEnd: (show: boolean) => void;
}) {
  const endVisible = showEnd || isMultiDay(w);
  return (
    <div className="mwhen">
      <input
        type="date"
        aria-label={tr(endVisible ? 'modal.startDate' : 'modal.date')}
        value={w.startDate}
        onChange={(e) => onChange((f) => setStartDate(f, e.target.value))}
      />
      {!w.allDay && (
        <span className="timebox">
          <input type="time" aria-label={tr('modal.startTime')} value={w.startTime} onChange={(e) => onChange((f) => ({ ...f, startTime: e.target.value }))} />–
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
            onChange={(e) => onChange((f) => ({ ...f, endDate: e.target.value }))}
          />
        </span>
      )}
      {!w.allDay && (
        <span className="timebox">
          <input type="time" aria-label={tr('modal.endTime')} value={w.endTime} onChange={(e) => onChange((f) => ({ ...f, endTime: e.target.value }))} />
        </span>
      )}
      <label>
        <input
          type="checkbox"
          checked={w.allDay}
          onChange={(e) => {
            onChange((f) => setAllDay(f, e.target.checked));
            onShowEnd(false);
          }}
        />{' '}
        {tr('modal.allDay')}
      </label>
      {!endVisible && (
        <button type="button" className="linkbtn" onClick={() => onShowEnd(true)}>
          {tr(w.allDay ? 'modal.severalDays' : 'modal.endsAnotherDay')}
        </button>
      )}
    </div>
  );
}
