import { addDays } from '../domain/dates';
import { planner, usePlanner, type SyncState } from '../state/planner';

const SYNC_TEXT: Record<SyncState, string> = { '': '', loading: 'Loading…', saving: 'Saving…', saved: 'Saved', error: 'Not saved' };

export function weekLabel(a: Date): string {
  const b = addDays(a, 6);
  const f = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString(undefined, o);
  return a.getMonth() === b.getMonth()
    ? `${f(a, { month: 'long' })} ${a.getDate()}–${b.getDate()}, ${b.getFullYear()}`
    : `${f(a, { month: 'short', day: 'numeric' })} – ${f(b, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

interface Props {
  onNew: () => void;
  onSettings: () => void;
  onToggleTheme: () => void;
}

export function TopBar({ onNew, onSettings, onToggleTheme }: Props) {
  const { week, sync, needAuth, settings } = usePlanner();
  return (
    <>
      <div className="top">
        <button type="button" className="iconbtn" aria-label="Previous week" aria-keyshortcuts="ArrowLeft" onClick={() => planner.shiftWeek(-1)}>
          ‹
        </button>
        <button type="button" className="iconbtn" aria-label="Next week" aria-keyshortcuts="ArrowRight" onClick={() => planner.shiftWeek(1)}>
          ›
        </button>
        <button type="button" className="btn" aria-keyshortcuts="t" onClick={() => planner.setWeek(new Date())}>
          Today
        </button>
        <h1>{weekLabel(week)}</h1>
        <span className="sp" />
        <span className={'sync' + (sync === 'error' ? ' err' : '')} role="status">
          {SYNC_TEXT[sync]}
        </span>
        <button type="button" className="iconbtn" aria-label="Toggle light or dark theme" onClick={onToggleTheme}>
          ◐
        </button>
        <button type="button" className="iconbtn" aria-label="Settings" onClick={onSettings}>
          ⚙
        </button>
        <button type="button" className="btn primary" aria-keyshortcuts="n" onClick={onNew}>
          New task
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
