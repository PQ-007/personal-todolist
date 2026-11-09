import { useState } from 'react';
import { parseYmd, ymd } from '../domain/dates';
import { nthOf, WEEK_ORDER, weekdayOf, type Freq, type Repeat, type Weekday } from '../domain/recurrence';
import { addMonths } from '../domain/views';
import { t, type MsgKey } from '../i18n';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { describeRepeat, weekdayName } from './repeatText';

const UNITS: Record<Freq, [MsgKey, MsgKey]> = {
  DAILY: ['rep.unitDay', 'rep.unitDays'],
  WEEKLY: ['rep.unitWeek', 'rep.unitWeeks'],
  MONTHLY: ['rep.unitMonth', 'rep.unitMonths'],
  YEARLY: ['rep.unitYear', 'rep.unitYears'],
};

interface Props {
  /** The task's start; weekday and day-of-month defaults come from it. */
  start: Date;
  initial: Repeat | null;
  onDone: (r: Repeat) => void;
  onCancel: () => void;
}

/** Google Calendar's "Custom recurrence": every N units, which weekdays, and when it ends. */
export function RepeatDialog({ start, initial, onDone, onCancel }: Props) {
  const base = initial && !initial.unsupported ? initial : null;
  const [freq, setFreq] = useState<Freq>(base?.freq ?? 'WEEKLY');
  const [interval, setInterval] = useState(base?.interval ?? 1);
  const [byDay, setByDay] = useState<Weekday[]>(base?.byDay?.length ? base.byDay : [weekdayOf(start)]);
  const [monthBy, setMonthBy] = useState<'day' | 'nth'>(base?.nth ? 'nth' : 'day');
  const [ends, setEnds] = useState<'never' | 'until' | 'count'>(base?.until ? 'until' : base?.count ? 'count' : 'never');
  const [until, setUntil] = useState(ymd(base?.until ?? addMonths(start, 3)));
  const [count, setCount] = useState(base?.count ?? 10);

  const repeat: Repeat = {
    freq,
    interval: Math.max(1, interval || 1),
    ...(freq === 'WEEKLY' ? { byDay } : {}),
    ...(freq === 'MONTHLY' && monthBy === 'nth' ? { nth: { n: nthOf(start), day: weekdayOf(start) } } : {}),
    ...(ends === 'count' ? { count: Math.max(1, count || 1) } : {}),
    ...(ends === 'until' && until ? { until: parseYmd(until) } : {}),
  };
  const toggleDay = (d: Weekday) =>
    setByDay((days) => (days.includes(d) ? (days.length > 1 ? days.filter((x) => x !== d) : days) : [...days, d]));

  return (
    <Dialog label={t('rep.customTitle')} onRequestClose={onCancel} className="repeatdlg">
      <form
        className="rp"
        onSubmit={(e) => {
          e.preventDefault();
          onDone(repeat);
        }}
      >
        <header className="rp-head">
          <h2>{t('rep.customTitle')}</h2>
          <button type="button" className="x" aria-label={t('modal.close')} onClick={onCancel}>
            <Icon name="x" />
          </button>
        </header>

        <div className="rp-row">
          <span className="rp-label">{t('rep.every')}</span>
          <input
            className="rp-num"
            type="number"
            min={1}
            max={99}
            value={interval}
            aria-label={t('rep.every')}
            onChange={(e) => setInterval(Number(e.target.value))}
          />
          <select value={freq} aria-label={t('rep.every')} onChange={(e) => setFreq(e.target.value as Freq)}>
            {(Object.keys(UNITS) as Freq[]).map((f) => (
              <option key={f} value={f}>
                {t(UNITS[f][interval > 1 ? 1 : 0])}
              </option>
            ))}
          </select>
        </div>

        {freq === 'WEEKLY' && (
          <div className="rp-block">
            <span className="rp-label">{t('rep.on')}</span>
            <div className="rp-days" role="group" aria-label={t('rep.on')}>
              {WEEK_ORDER.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={byDay.includes(d)}
                  aria-label={weekdayName(d)}
                  title={weekdayName(d)}
                  className={'rp-day' + (byDay.includes(d) ? ' on' : '')}
                  onClick={() => toggleDay(d)}
                >
                  {weekdayName(d, 'narrow')}
                </button>
              ))}
            </div>
          </div>
        )}

        {freq === 'MONTHLY' && (
          <div className="rp-block">
            <select value={monthBy} aria-label={t('rep.on')} onChange={(e) => setMonthBy(e.target.value as 'day' | 'nth')}>
              <option value="day">{describeRepeat({ freq: 'MONTHLY', interval: 1 }, start)}</option>
              <option value="nth">{describeRepeat({ freq: 'MONTHLY', interval: 1, nth: { n: nthOf(start), day: weekdayOf(start) } }, start)}</option>
            </select>
          </div>
        )}

        <fieldset className="rp-block rp-ends">
          <legend className="rp-label">{t('rep.ends')}</legend>
          <label>
            <input type="radio" name="rp-ends" checked={ends === 'never'} onChange={() => setEnds('never')} />
            {t('rep.never')}
          </label>
          <label>
            <input type="radio" name="rp-ends" checked={ends === 'until'} onChange={() => setEnds('until')} />
            <span className="rp-endlabel">{t('rep.onDate')}</span>
            <input type="date" value={until} min={ymd(start)} disabled={ends !== 'until'} aria-label={t('rep.onDate')} onChange={(e) => setUntil(e.target.value)} />
          </label>
          <label>
            <input type="radio" name="rp-ends" checked={ends === 'count'} onChange={() => setEnds('count')} />
            <span className="rp-endlabel">{t('rep.after')}</span>
            <input
              className="rp-num"
              type="number"
              min={1}
              max={999}
              value={count}
              disabled={ends !== 'count'}
              aria-label={t('rep.after')}
              onChange={(e) => setCount(Number(e.target.value))}
            />
            {t('rep.occurrences')}
          </label>
        </fieldset>

        <p className="rp-summary">
          <Icon name="repeat" size={16} />
          {describeRepeat(repeat, start)}
        </p>

        <footer className="rp-foot">
          <button type="button" className="btn" onClick={onCancel}>
            {t('modal.cancel')}
          </button>
          <button type="submit" className="btn primary">
            {t('set.done')}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
