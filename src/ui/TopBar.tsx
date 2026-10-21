import type { MouseEvent } from 'react';
import { addDays } from '../domain/dates';
import { matchesFilter, type LabelFilter } from '../domain/labels';
import { MAX_SPAN, type View } from '../domain/views';
import { fmtDate, fmtRange, t, type MsgKey } from '../i18n';
import { planner, usePlanner, type Mode, type PlannerState, type SyncState } from '../state/planner';
import type { Theme } from '../state/settings';
import type { MenuEntry, MenuState } from './ContextMenu';
import { Icon, type IconName } from './Icon';

const SYNC_TEXT: Record<SyncState, MsgKey | null> = {
  '': null,
  loading: 'sync.loading',
  saving: 'sync.saving',
  saved: 'sync.saved',
  error: 'sync.error',
};

const MODES: { mode: Mode; label: MsgKey; icon: IconName; key: string }[] = [
  { mode: 'focus', label: 'mode.focus', icon: 'focus', key: 'F' },
  { mode: 'plan', label: 'mode.plan', icon: 'week', key: 'P' },
];

export const VIEWS: { view: View; label: MsgKey; key: string; icon: IconName }[] = [
  { view: 'day', label: 'view.day', key: 'D', icon: 'day' },
  { view: 'workweek', label: 'view.workweek', key: 'X', icon: 'week' },
  { view: 'week', label: 'view.week', key: 'W', icon: 'week' },
  { view: 'month', label: 'view.month', key: 'M', icon: 'month' },
];

export const FILTERS: { filter: LabelFilter; label: MsgKey; icon: IconName }[] = [
  { filter: 'all', label: 'filter.all', icon: 'all' },
  { filter: 'work', label: 'label.work', icon: 'work' },
  { filter: 'personal', label: 'label.personal', icon: 'personal' },
];

/** "October 21, 2026", "October 19 – 23, 2026" or "October 2026", in the current language. */
function rangeTitle({ view, day, range }: PlannerState): string {
  if (view === 'month') return fmtDate(day, { year: 'numeric', month: 'long' });
  if (range.days === 1) return fmtDate(day, { year: 'numeric', month: 'long', day: 'numeric' });
  return fmtRange(range.from, addDays(range.from, range.days - 1), { year: 'numeric', month: 'long', day: 'numeric' });
}

const viewName = (view: View, span: number) =>
  view === 'day' && span > 1 ? t('view.days', { n: span }) : t(VIEWS.find((v) => v.view === view)!.label);

const MAC = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');

interface Props {
  theme: Theme;
  onToggleTheme: () => void;
  onNew: () => void;
  onSettings: () => void;
  onPalette: () => void;
  onMenu: (menu: MenuState) => void;
}

export function TopBar({ theme, onToggleTheme, onNew, onSettings, onPalette, onMenu }: Props) {
  const state = usePlanner();
  const { mode, view, span, range, sync, needAuth, settings, filter, stack, stackOpen } = state;
  const plan = mode === 'plan';
  const weekly = view === 'workweek' || view === 'week';
  const syncKey = SYNC_TEXT[sync];
  const todoCount = stack.filter((s) => matchesFilter(s, filter)).length;
  const step = (n: number) => (plan ? planner.step(n) : planner.stepDay(n));
  const menuAt = (e: MouseEvent<HTMLButtonElement>, label: string, items: MenuEntry[], alignRight = false) => {
    const r = e.currentTarget.getBoundingClientRect();
    onMenu({ x: alignRight ? r.right - 248 : r.left, y: r.bottom + 6, label, items });
  };

  const openViewMenu = (e: MouseEvent<HTMLButtonElement>) =>
    menuAt(e, t('view.label'), [
      ...VIEWS.map((v) => ({
        label: t(v.label),
        icon: v.icon,
        hint: v.key,
        checked: view === v.view && (v.view !== 'day' || span === 1),
        onSelect: () => planner.setView(v.view, v.view === 'day' ? 1 : undefined),
      })),
      { kind: 'separator' },
      {
        kind: 'chips',
        label: t('view.daysLabel'),
        value: view === 'day' ? String(span) : undefined,
        options: Array.from({ length: MAX_SPAN }, (_, i) => ({ id: String(i + 1), label: String(i + 1) })),
        onSelect: (n) => planner.setView('day', Number(n)),
      },
    ]);

  const openMoreMenu = (e: MouseEvent<HTMLButtonElement>) => {
    const prev = addDays(range.from, -7);
    menuAt(
      e,
      t('more.menu'),
      [
        { label: t('new.task'), icon: 'plus', hint: 'C', onSelect: onNew },
        ...(plan && weekly
          ? [
              {
                label: t('week.copyPrev'),
                icon: 'copy' as const,
                hint: fmtRange(prev, addDays(prev, range.days - 1), { month: 'short', day: 'numeric' }),
                onSelect: () => void planner.copyPreviousWeek(),
              },
            ]
          : []),
        { kind: 'separator' },
        { label: t(theme === 'dark' ? 'theme.light' : 'theme.dark'), icon: theme === 'dark' ? 'sun' : 'moon', onSelect: onToggleTheme },
        { label: t('settings'), icon: 'settings', onSelect: onSettings },
      ],
      true,
    );
  };

  return (
    <header className="top">
      <div className="top-row">
        <div className="modes" role="tablist" aria-label={t('mode.label')}>
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              role="tab"
              aria-selected={mode === m.mode}
              className={'mode' + (mode === m.mode ? ' on' : '')}
              title={`${t(m.label)} (${m.key})`}
              aria-keyshortcuts={m.key.toLowerCase()}
              onClick={() => planner.setMode(m.mode)}
            >
              <Icon name={m.icon} size={16} />
              <span className="btn-label">{t(m.label)}</span>
            </button>
          ))}
        </div>

        <div className="nav">
          <button type="button" className="iconbtn" aria-label={t('nav.prev')} title={t('nav.prev')} aria-keyshortcuts="ArrowLeft" onClick={() => step(-1)}>
            <Icon name="chevron-left" />
          </button>
          <button type="button" className="btn ghost today" aria-keyshortcuts="t" onClick={() => planner.setDay(new Date())}>
            {t('nav.today')}
          </button>
          <button type="button" className="iconbtn" aria-label={t('nav.next')} title={t('nav.next')} aria-keyshortcuts="ArrowRight" onClick={() => step(1)}>
            <Icon name="chevron-right" />
          </button>
        </div>
        {plan && <h1>{rangeTitle(state)}</h1>}
        <span
          className={'syncdot ' + (sync || 'idle')}
          role="status"
          title={syncKey ? t(syncKey) : undefined}
          aria-label={syncKey ? t(syncKey) : undefined}
        >
          {sync === 'error' && t('sync.error')}
        </span>

        <span className="sp" />

        <button type="button" className="search" onClick={onPalette} aria-keyshortcuts="Control+K Meta+K">
          <Icon name="search" size={16} />
          <span className="btn-label">{t('search.button')}</span>
          <kbd>{MAC ? '⌘K' : 'Ctrl K'}</kbd>
        </button>

        <div className="filters" role="group" aria-label={t('filter.label')}>
          {FILTERS.map((f) => (
            <button
              key={f.filter}
              type="button"
              className={'filter f-' + f.filter + (filter === f.filter ? ' on' : '')}
              aria-pressed={filter === f.filter}
              aria-label={t(f.label)}
              title={t(f.label)}
              onClick={() => planner.setFilter(f.filter)}
            >
              <Icon name={f.icon} size={16} />
            </button>
          ))}
        </div>

        {plan && (
          <>
            <button type="button" className="btn ghost viewmenu" aria-haspopup="menu" onClick={openViewMenu}>
              <span>{viewName(view, span)}</span>
              <Icon name="chevron-down" size={14} />
            </button>
            <button
              type="button"
              className={'iconbtn paneltoggle' + (stackOpen ? ' on' : '')}
              aria-label={t('panel.toggle')}
              title={`${t('panel.toggle')} (S)`}
              aria-pressed={stackOpen}
              aria-keyshortcuts="s"
              onClick={() => planner.setStackOpen(!stackOpen)}
            >
              <Icon name="panel" />
              {!stackOpen && todoCount > 0 && <span className="badge">{todoCount}</span>}
            </button>
            <button type="button" className="btn primary newbtn" aria-keyshortcuts="c" title={`${t('new.task')} (C)`} onClick={onNew}>
              <Icon name="plus" size={16} />
              <span className="btn-label">{t('new.task')}</span>
            </button>
          </>
        )}
        <button type="button" className="iconbtn" aria-label={t('more.menu')} title={t('more.menu')} aria-haspopup="menu" onClick={openMoreMenu}>
          <Icon name="more" />
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
