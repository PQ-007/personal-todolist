import { addDays, sameDay } from '../domain/dates';
import { planner, usePlanner, type SyncState } from '../state/planner';
import { useNow } from './hooks';

const SYNC_TEXT: Record<SyncState, string> = { '': '', loading: 'Loading…', saving: 'Saving…', saved: 'Saved', error: 'Not saved' };

export function weekLabel(a: Date): string {
  const b = addDays(a, 4);
  const f = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString(undefined, o);
  return a.getMonth() === b.getMonth()
    ? `${f(a, { month: 'long' })} ${a.getDate()}–${b.getDate()}, ${b.getFullYear()}`
    : `${f(a, { month: 'short', day: 'numeric' })} – ${f(b, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function dayLabel(d: Date, now: Date): string {
  const name = d.toLocaleDateString(undefined, { weekday: 'long' });
  return sameDay(d, now) ? `Today · ${name}` : d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

interface Props {
  onNew: () => void;
  onSettings: () => void;
  onToggleTheme: () => void;
}

export function TopBar({ onNew, onSettings, onToggleTheme }: Props) {
  const { view, day, week, sync, needAuth, settings } = usePlanner();
  const now = useNow();
  const focus = view === 'focus';
  const step = (n: number) => (focus ? planner.shiftDay(n) : planner.shiftWeek(n));
  return (
    <>
      <div className="top">
        <button type="button" className="iconbtn" aria-label={focus ? 'Previous workday' : 'Previous week'} aria-keyshortcuts="ArrowLeft" onClick={() => step(-1)}>
          ‹
        </button>
        <button type="button" className="iconbtn" aria-label={focus ? 'Next workday' : 'Next week'} aria-keyshortcuts="ArrowRight" onClick={() => step(1)}>
          ›
        </button>
        <h1>{focus ? dayLabel(day, now) : weekLabel(week)}</h1>
        <button type="button" className="linkbtn" aria-keyshortcuts="t" onClick={() => planner.setDay(new Date())}>
          Today
        </button>
        <span className="sp" />
        <span className={'sync' + (sync === 'error' ? ' err' : '')} role="status">
          {SYNC_TEXT[sync]}
        </span>
        {!focus && (
          <button type="button" className="btn primary" aria-keyshortcuts="n" onClick={onNew}>
            New task
          </button>
        )}
        <button type="button" className="linkbtn" aria-keyshortcuts="w" onClick={() => planner.setView(focus ? 'week' : 'focus')}>
          {focus ? 'Week' : 'Day'}
        </button>
        <button type="button" className="iconbtn" aria-label="Toggle light or dark theme" onClick={onToggleTheme}>
          ◐
        </button>
        <button type="button" className="iconbtn" aria-label="Settings" onClick={onSettings}>
          ⚙
        </button>
      </div>
      {settings.mode === 'google' && needAuth && (
        <div className="authbar">
          <span>Google Calendar isn’t connected in this session.</span>
          <button type="button" className="btn primary" onClick={() => void planner.connect()}>
            Connect
          </button>
        </div>
      )}
    </>
  );
}
