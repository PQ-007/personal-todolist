import { addDays } from '../domain/dates';
import type { LabelFilter } from '../domain/labels';
import { fmtDate, fmtRange, t, type MsgKey } from '../i18n';
import { planner, usePlanner, type PlannerState, type SyncState } from '../state/planner';
import { Icon, type IconName } from './Icon';

const SYNC_TEXT: Record<SyncState, MsgKey | null> = {
  '': null,
  loading: 'sync.loading',
  saving: 'sync.saving',
  saved: 'sync.saved',
  error: 'sync.error',
};

const VIEWS: { view: PlannerState['view']; label: MsgKey; key: string }[] = [
  { view: 'day', label: 'view.day', key: 'd' },
  { view: 'workweek', label: 'view.workweek', key: 'x' },
  { view: 'week', label: 'view.week', key: 'w' },
];

const FILTERS: { filter: LabelFilter; label: MsgKey; icon: IconName }[] = [
  { filter: 'all', label: 'filter.all', icon: 'all' },
  { filter: 'work', label: 'label.work', icon: 'work' },
  { filter: 'personal', label: 'label.personal', icon: 'personal' },
];

export function TopBar({ onSettings }: { onSettings: () => void }) {
  const { view, day, week, sync, needAuth, settings, filter } = usePlanner();
  const isDay = view === 'day';
  const step = (n: number) => (isDay ? planner.shiftDay(n) : planner.shiftWeek(n));
  const title = isDay
    ? fmtDate(day, { year: 'numeric', month: 'long', day: 'numeric' })
    : fmtRange(week, addDays(week, view === 'workweek' ? 4 : 6), { year: 'numeric', month: 'long' });
  const syncKey = SYNC_TEXT[sync];
  const weekDays = view === 'workweek' ? 5 : 7;
  const prevWeek = addDays(week, -7);
  const copyHint = t('week.copyPrevHint', {
    range: fmtRange(prevWeek, addDays(prevWeek, weekDays - 1), { month: 'short', day: 'numeric' }),
  });

  return (
    <header className="top">
      <div className="top-row">
        <button type="button" className="btn" aria-keyshortcuts="t" onClick={() => planner.setDay(new Date())}>
          {t('nav.today')}
        </button>
        <div className="seg">
          <button
            type="button"
            className="iconbtn"
            aria-label={t(isDay ? 'nav.prevDay' : 'nav.prevWeek')}
            title={t(isDay ? 'nav.prevDay' : 'nav.prevWeek')}
            aria-keyshortcuts="ArrowLeft"
            onClick={() => step(-1)}
          >
            <Icon name="chevron-left" />
          </button>
          <button
            type="button"
            className="iconbtn"
            aria-label={t(isDay ? 'nav.nextDay' : 'nav.nextWeek')}
            title={t(isDay ? 'nav.nextDay' : 'nav.nextWeek')}
            aria-keyshortcuts="ArrowRight"
            onClick={() => step(1)}
          >
            <Icon name="chevron-right" />
          </button>
        </div>
        <h1>{title}</h1>
        <span className="sp" />
        <span className={'sync' + (sync === 'error' ? ' err' : '')} role="status">
          {syncKey && t(syncKey)}
        </span>
        {!isDay && (
          <button type="button" className="btn ghost copyweek" title={copyHint} aria-label={copyHint} onClick={() => void planner.copyPreviousWeek(weekDays)}>
            <Icon name="copy" size={16} />
            <span className="btn-label">{t('week.copyPrev')}</span>
          </button>
        )}
        <div className="views filters" role="group" aria-label={t('filter.label')}>
          {FILTERS.map((f) => (
            <button
              key={f.filter}
              type="button"
              className={'viewbtn' + (filter === f.filter ? ' on' : '') + ' f-' + f.filter}
              aria-pressed={filter === f.filter}
              aria-label={t(f.label)}
              title={t(f.label)}
              onClick={() => planner.setFilter(f.filter)}
            >
              <Icon name={f.icon} size={16} />
            </button>
          ))}
        </div>
        <div className="views" role="group" aria-label={t('view.label')}>
          {VIEWS.map((v) => (
            <button
              key={v.view}
              type="button"
              className={'viewbtn' + (view === v.view ? ' on' : '')}
              aria-pressed={view === v.view}
              aria-keyshortcuts={v.key}
              title={`${t(v.label)} (${v.key.toUpperCase()})`}
              onClick={() => planner.setView(v.view)}
            >
              {t(v.label)}
            </button>
          ))}
        </div>
        <button type="button" className="iconbtn" aria-label={t('settings')} title={t('settings')} onClick={onSettings}>
          <Icon name="settings" />
        </button>
      </div>
      {settings.mode === 'google' && needAuth && (
        <div className="authbar">
          <span>{t('auth.notConnected')}</span>
          <button type="button" className="btn primary" onClick={() => void planner.connect()}>
            {t('auth.connect')}
          </button>
        </div>
      )}
    </header>
  );
}
