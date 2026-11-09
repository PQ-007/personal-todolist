import { useEffect, useState, type CSSProperties } from 'react';
import { colorVars } from '../../domain/colors';
import { addDays, mondayOf, sameDay, ymd } from '../../domain/dates';
import { streaks, weekReview, type Streak } from '../../domain/review';
import type { Task } from '../../domain/types';
import { fmtDate, fmtRange, t } from '../../i18n';
import { planner } from '../../state/planner';
import { Dialog } from '../common/Dialog';
import { Icon } from '../common/Icon';

/** How far back streaks look. */
const HISTORY_DAYS = 56;
const MAX_STREAKS = 6;
/** Height of the busiest day's column. */
const COL_PX = 80;

const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);

/** A week at a glance: what got done, day by day and by label, and the repeating tasks kept up. */
export function ReviewDialog({ onClose }: { onClose: () => void }) {
  const [monday, setMonday] = useState(() => mondayOf(planner.get().day));
  const [loaded, setLoaded] = useState<{ key: string; tasks: Task[] } | null>(null);
  const key = ymd(monday);

  useEffect(() => {
    let live = true;
    // The week before (for the comparison) and the weeks streaks look back on.
    void planner.peek(addDays(monday, -HISTORY_DAYS), addDays(monday, 7)).then((tasks) => live && setLoaded({ key, tasks }));
    return () => {
      live = false;
    };
  }, [monday, key]);

  const tasks = loaded?.key === key ? loaded.tasks : null;
  const now = new Date();
  const week = tasks && weekReview(tasks, monday);
  const prev = tasks && weekReview(tasks, addDays(monday, -7));
  // Streaks as of the end of the week shown (or now, for the current week).
  const asOf = addDays(monday, 7) < now ? addDays(monday, 7) : now;
  const runs = tasks ? streaks(tasks, asOf).slice(0, MAX_STREAKS) : [];
  const busiest = week ? Math.max(1, ...week.days.map((d) => d.total)) : 1;
  const thisWeek = sameDay(monday, mondayOf(now));

  return (
    <Dialog label={t('review.title')} onRequestClose={onClose} className="review">
      <div className="rv">
        <header className="rv-head">
          <h2>{t('review.title')}</h2>
          <div className="nav">
            <button type="button" className="iconbtn" aria-label={t('review.prev')} title={t('review.prev')} onClick={() => setMonday((m) => addDays(m, -7))}>
              <Icon name="chevron-left" />
            </button>
            <span className="rv-range">{fmtRange(monday, addDays(monday, 6), { month: 'short', day: 'numeric' })}</span>
            <button
              type="button"
              className="iconbtn"
              aria-label={t('review.next')}
              title={t('review.next')}
              disabled={thisWeek}
              onClick={() => setMonday((m) => addDays(m, 7))}
            >
              <Icon name="chevron-right" />
            </button>
          </div>
          <button type="button" className="iconbtn" aria-label={t('modal.close')} onClick={onClose}>
            <Icon name="x" />
          </button>
        </header>

        {!week || !prev ? (
          <p className="rv-empty">{t('sync.loading')}</p>
        ) : !week.total ? (
          <p className="rv-empty">{t('review.empty')}</p>
        ) : (
          <>
            <section className="rv-hero" aria-label={t('review.summary')}>
              <p className="rv-big">
                {week.done}
                <span>/{week.total}</span>
              </p>
              <div>
                <p className="rv-sub">{t('review.done', { pct: pct(week.done, week.total) })}</p>
                {prev.total > 0 && <p className="rv-vs">{t('review.vsLast', { done: prev.done, total: prev.total })}</p>}
              </div>
            </section>

            <section aria-label={t('review.byDay')}>
              <h3>{t('review.byDay')}</h3>
              <ol className="rv-days">
                {week.days.map((d) => {
                  const label = `${fmtDate(d.day, { weekday: 'long', month: 'short', day: 'numeric' })}: ${t('panel.progress', { done: d.done, total: d.total })}`;
                  return (
                    <li key={ymd(d.day)} title={label} aria-label={label} className={sameDay(d.day, now) ? 'today' : undefined}>
                      <span className="rv-col" style={{ height: `${(d.total / busiest) * COL_PX}px` }}>
                        <i style={{ height: `${pct(d.done, d.total)}%` }} />
                      </span>
                      <span className="rv-n">{d.total ? `${d.done}/${d.total}` : '–'}</span>
                      <span className="rv-wd">{fmtDate(d.day, { weekday: 'narrow' })}</span>
                    </li>
                  );
                })}
              </ol>
            </section>

            {week.byLabel.length > 1 && (
              <section aria-label={t('review.byLabel')}>
                <h3>{t('review.byLabel')}</h3>
                <ul className="rv-labels">
                  {week.byLabel.map((l) => (
                    <li key={l.label ?? 'none'}>
                      <span className="rv-lname">
                        {l.label && <Icon name={l.label} size={14} />}
                        {t(l.label === 'work' ? 'label.work' : l.label === 'personal' ? 'label.personal' : 'label.none')}
                      </span>
                      <span className="pbar">
                        <i style={{ width: `${pct(l.done, l.total)}%` }} />
                      </span>
                      <span className="rv-n">{t('panel.progress', { done: l.done, total: l.total })}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {tasks && (
          <section aria-label={t('review.streaks')}>
            <h3>{t('review.streaks')}</h3>
            {runs.length ? (
              <ul className="rv-streaks">
                {runs.map((s: Streak) => (
                  <li key={s.seriesId} style={colorVars(s.colorId) as CSSProperties} className={s.current ? undefined : 'broken'}>
                    <Icon name="streak" size={16} />
                    <span className="rv-stitle">{s.title}</span>
                    <span className="rv-run">{t('review.inARow', { n: s.current })}</span>
                    <span className="rv-best">{t('review.best', { n: s.best })}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rv-empty small">{t('review.noStreaks')}</p>
            )}
          </section>
        )}
      </div>
    </Dialog>
  );
}
