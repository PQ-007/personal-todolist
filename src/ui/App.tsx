import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { COLORS, COLOR_NAMES } from '../domain/colors';
import { addMin, hm, parseYmd, sameDay, withTime } from '../domain/dates';
import { labelFor, LABELS } from '../domain/labels';
import type { Task } from '../domain/types';
import { MAX_SPAN, rangeDays } from '../domain/views';
import { fmtDate, LANGS, setLang, t, useLang, type Lang } from '../i18n';
import { planner, usePlanner } from '../state/planner';
import { loadTheme, saveTheme, type Theme } from '../state/settings';
import { CommandPalette, type Command } from './CommandPalette';
import { ContextMenu, type MenuEntry, type MenuState } from './ContextMenu';
import { FocusView, QUICK_ADD_ID } from './FocusView';
import { isTyping, shortcutKey } from './keys';
import { MiniCalendar } from './MiniCalendar';
import { MonthView } from './MonthView';
import { PlanPanel } from './PlanPanel';
import { SettingsDialog } from './SettingsDialog';
import { STACK_ADD_ID } from './StackPanel';
import { TaskModal, type ModalTarget } from './TaskModal';
import { TaskView } from './TaskView';
import { slotTime, TimeGrid } from './TimeGrid';
import { Toast } from './Toast';
import { FILTERS, TopBar, VIEWS } from './TopBar';
import { UpdatePrompt } from './UpdatePrompt';

const MAC = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');
const KEYS = MAC ? { copy: '⌘C', paste: '⌘V', del: '⌫' } : { copy: 'Ctrl+C', paste: 'Ctrl+V', del: 'Del' };

/** True while the user has text selected, so copy and right-click keep their usual meaning. */
const hasTextSelection = () => !!globalThis.getSelection?.()?.toString();

/** True when the user right-clicked on selected text, which should get the browser's own menu. */
const selectionTouches = (el: Element) => {
  const sel = globalThis.getSelection?.();
  return !!sel && !sel.isCollapsed && sel.containsNode(el, true);
};

/** The task a keyboard shortcut applies to: the focused card, chip or row. */
const focusedTaskId = () => (document.activeElement?.closest('[data-id]') as HTMLElement | null)?.dataset.id;

/** Default start for a new task on `day`: the next full hour today, otherwise 09:00. */
const defaultStart = (day: Date) => {
  const n = new Date();
  return sameDay(day, n) ? addMin(new Date(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours()), 60) : withTime(day, 9, 0);
};

export function App() {
  // Subscribing here re-renders the whole tree when the language changes.
  const lang = useLang();
  const { mode, view, range, stackOpen, tasks } = usePlanner();
  const [modal, setModal] = useState<ModalTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    void planner.refresh();
  }, []);

  const open = (id: string) => setModal({ kind: 'view', id });
  const edit = (id: string) => setModal({ kind: 'edit', id });
  const create = (start: Date = defaultStart(planner.get().day)) => setModal({ kind: 'new', start, label: labelFor(planner.get().filter) });
  const closeModal = useCallback(() => setModal(null), []);
  const toggleTheme = () => setTheme((th) => (th === 'dark' ? 'light' : 'dark'));
  /** "n": the add box of whatever is on screen. */
  const focusAdd = () => {
    const id = planner.get().mode === 'focus' ? QUICK_ADD_ID : STACK_ADD_ID;
    if (id === STACK_ADD_ID) planner.setStackOpen(true);
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  };

  /** The actions for one calendar task (right-click, or the "…" button in focus mode). */
  const taskMenu = (task: Task): MenuEntry[] => [
    {
      kind: 'swatches',
      label: t('modal.color'),
      value: task.colorId,
      options: Object.entries(COLORS).map(([id, color]) => ({ id, color, name: t(COLOR_NAMES[id]!) })),
      onSelect: (colorId) => void planner.patch(task.id, { colorId }),
    },
    { kind: 'separator' },
    { label: t('menu.open'), icon: 'open', hint: 'Enter', onSelect: () => open(task.id) },
    { label: t('menu.edit'), icon: 'edit', onSelect: () => edit(task.id) },
    { label: t(task.done ? 'menu.markUndone' : 'panel.markDone'), icon: 'check-circle', onSelect: () => void planner.toggleDone(task.id) },
    { kind: 'separator' },
    ...LABELS.map((l) => ({
      label: t(l === 'work' ? 'label.work' : 'label.personal'),
      icon: l,
      checked: task.label === l,
      onSelect: () => void planner.patch(task.id, { label: task.label === l ? undefined : l }),
    })),
    { kind: 'separator' },
    { label: t('menu.duplicate'), icon: 'duplicate', onSelect: () => planner.duplicate(task.id) },
    { label: t('menu.nextDay'), icon: 'arrow-right', onSelect: () => planner.moveDays(task.id, 1) },
    { label: t('menu.toStack'), icon: 'inbox', onSelect: () => planner.unschedule(task.id) },
    { label: t('menu.copy'), icon: 'copy', hint: KEYS.copy, onSelect: () => planner.copy(task.id) },
    { kind: 'separator' },
    { label: t('menu.delete'), icon: 'trash', hint: KEYS.del, danger: true, onSelect: () => planner.deleteWithUndo(task.id) },
  ];

  const openTaskMenu = (id: string, x: number, y: number) => {
    const task = planner.find(id);
    if (task) setMenu({ x, y, label: t('menu.label'), items: taskMenu(task) });
  };

  /** Right-click (or long press) on a task, or on empty space in the grid. */
  const onContextMenu = (e: MouseEvent) => {
    const el = e.target as Element;
    if (el.closest('input,textarea,a') || selectionTouches(el)) return;
    const taskEl = el.closest<HTMLElement>('[data-id]');
    const dayEl = el.closest<HTMLElement>('[data-day]');
    if (!taskEl && !dayEl) return;
    e.preventDefault();
    // Keyboard-opened menus (Shift+F10, Menu key) have no pointer position.
    const r = (taskEl ?? dayEl)!.getBoundingClientRect();
    const [x, y] = e.clientX || e.clientY ? [e.clientX, e.clientY] : [r.left + 16, r.top + 16];
    if (taskEl) return openTaskMenu(taskEl.dataset.id!, x, y);

    const day = parseYmd(dayEl!.dataset.day!);
    // In a day column the click picks a time; elsewhere only the day is known.
    const time = 'slots' in dayEl!.dataset ? slotTime(dayEl!, e.clientY || r.top, day) : undefined;
    const { clipboard } = planner.get();
    setMenu({
      x,
      y,
      label: t('menu.label'),
      items: [
        { label: t('menu.newHere'), icon: 'plus', onSelect: () => create(time ?? withTime(day, 9, 0)) },
        {
          label: clipboard ? t('menu.pasteTitle', { title: clipboard.title }) : t('menu.paste'),
          icon: 'copy',
          hint: KEYS.paste,
          disabled: !clipboard,
          onSelect: () => planner.paste(day, time),
        },
      ],
    });
  };

  /** Everything the command palette offers: actions first, then the tasks on screen by title. */
  const commands = (): Command[] => {
    const state = planner.get();
    const actions: Command[] = [
      { id: 'focus', label: t('mode.focus'), icon: 'focus', hint: 'F', group: 'actions', run: () => planner.setMode('focus') },
      { id: 'plan', label: t('mode.plan'), icon: 'week', hint: 'P', group: 'actions', run: () => planner.setMode('plan') },
      { id: 'today', label: t('palette.goToday'), icon: 'day', hint: 'T', group: 'actions', run: () => planner.setDay(new Date()) },
      { id: 'new', label: t('new.task'), icon: 'plus', hint: 'C', group: 'actions', run: () => create() },
      { id: 'todo', label: t('palette.addTodo'), icon: 'inbox', hint: 'N', group: 'actions', run: focusAdd },
      ...VIEWS.map((v) => ({
        id: 'view-' + v.view,
        label: t('palette.view', { name: t(v.label) }),
        icon: v.icon,
        hint: v.key,
        group: 'actions' as const,
        run: () => planner.setView(v.view, v.view === 'day' ? 1 : undefined),
      })),
      ...FILTERS.map((f) => ({
        id: 'filter-' + f.filter,
        label: t('palette.filter', { name: t(f.label) }),
        icon: f.icon,
        group: 'actions' as const,
        run: () => planner.setFilter(f.filter),
      })),
      { id: 'panel', label: t('panel.toggle'), icon: 'panel', hint: 'S', group: 'actions', run: () => planner.setStackOpen(!state.stackOpen) },
      { id: 'copyweek', label: t('week.copyPrev'), icon: 'copy', group: 'actions', run: () => void planner.copyPreviousWeek() },
      { id: 'theme', label: t(theme === 'dark' ? 'theme.light' : 'theme.dark'), icon: theme === 'dark' ? 'sun' : 'moon', group: 'actions', run: toggleTheme },
      ...(Object.keys(LANGS) as Lang[]).map((l) => ({
        id: 'lang-' + l,
        label: t('palette.lang', { name: LANGS[l] }),
        keywords: 'language',
        icon: 'globe' as const,
        group: 'actions' as const,
        run: () => setLang(l),
      })),
      { id: 'settings', label: t('settings'), icon: 'settings', group: 'actions', run: () => setSettingsOpen(true) },
    ];
    const found: Command[] = tasks.map((task) => ({
      id: 'task-' + task.id,
      label: task.title,
      keywords: (task.tags ?? []).map((tag) => '#' + tag).join(' '),
      hint: fmtDate(task.start, { weekday: 'short', month: 'short', day: 'numeric' }) + (task.allDay ? '' : ' ' + hm(task.start)),
      icon: task.done ? 'check-circle' : 'clock',
      group: 'tasks',
      run: () => open(task.id),
    }));
    return [...found, ...actions];
  };

  // Shortcuts follow Google Calendar where they overlap: t today, d/x/w/m views (x is its custom view),
  // 1–7 for that many days, j/k or arrows to move, c to create. f/p switch modes, Ctrl/⌘+K or /
  // opens the palette, n jumps to the add box. Ctrl/⌘+C and Ctrl/⌘+V copy the focused task and
  // paste it on the selected day; Delete removes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      const key = shortcutKey(e);
      if ((e.ctrlKey || e.metaKey) && key === 'k') {
        e.preventDefault();
        if (!document.querySelector('dialog[open]')) setPaletteOpen(true);
        return;
      }
      if (isTyping(e.target) || (e.target as Element | null)?.closest?.('dialog') || e.altKey) return;
      if (document.querySelector('dialog[open]')) return;
      if (e.ctrlKey || e.metaKey) {
        const id = focusedTaskId();
        if (key === 'c' && id && !hasTextSelection()) planner.copy(id);
        else if (key === 'v' && planner.get().clipboard) planner.paste(planner.get().day);
        return;
      }
      if (key === 'Delete' || key === 'Backspace') {
        const id = focusedTaskId();
        if (id) {
          e.preventDefault();
          planner.deleteWithUndo(id);
        }
        return;
      }
      const focus = planner.get().mode === 'focus';
      const step = (n: number) => (focus ? planner.stepDay(n) : planner.step(n));
      // Shift+letter is left alone (it may be a browser or OS shortcut).
      if (e.shiftKey && key.length === 1) return;
      const n = Number(key);
      if (key === 'ArrowLeft' || key === 'k') step(-1);
      else if (key === 'ArrowRight' || key === 'j') step(1);
      else if (key === 't') planner.setDay(new Date());
      else if (key === 'f') planner.setMode('focus');
      else if (key === 'p') planner.setMode('plan');
      else if (key === 'd') planner.setView('day', 1);
      else if (n >= 1 && n <= MAX_SPAN) planner.setView('day', n);
      else if (key === 'x') planner.setView('workweek');
      else if (key === 'w') planner.setView('week');
      else if (key === 'm') planner.setView('month');
      else if (key === 's') planner.setStackOpen(!planner.get().stackOpen);
      else if (key === 'c') create();
      else if (key === 'n') {
        e.preventDefault();
        focusAdd();
      } else if (key === '/') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={'app mode-' + mode} onContextMenu={onContextMenu}>
      <TopBar
        theme={theme}
        onToggleTheme={toggleTheme}
        onNew={() => create()}
        onSettings={() => setSettingsOpen(true)}
        onPalette={() => setPaletteOpen(true)}
        onMenu={setMenu}
      />
      {mode === 'focus' ? (
        <main className="focus-main">
          <FocusView onEdit={edit} onMenu={setMenu} onTaskMenu={openTaskMenu} />
        </main>
      ) : (
        <div className={'plan' + (stackOpen ? ' with-panel' : '')}>
          <aside className="side" aria-label={t('day.today')}>
            <MiniCalendar />
            <FocusView compact onEdit={edit} onMenu={setMenu} onTaskMenu={openTaskMenu} />
          </aside>
          <main>
            {view === 'month' ? <MonthView onOpen={open} /> : <TimeGrid days={rangeDays(range)} onOpen={open} onCreate={create} />}
          </main>
          {stackOpen && <PlanPanel onMenu={setMenu} />}
        </div>
      )}
      {modal?.kind === 'view' && <TaskView key={modal.id} id={modal.id} onClose={closeModal} onEdit={() => edit(modal.id)} />}
      {modal && modal.kind !== 'view' && (
        <TaskModal
          key={JSON.stringify(modal)}
          target={modal}
          // Leaving the editor of an existing task goes back to its view.
          onClose={() => setModal(modal.kind === 'edit' ? { kind: 'view', id: modal.id } : null)}
        />
      )}
      {settingsOpen && <SettingsDialog theme={theme} onTheme={setTheme} onClose={() => setSettingsOpen(false)} />}
      {paletteOpen && <CommandPalette commands={commands()} onClose={closePalette} />}
      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
      <Toast />
      <UpdatePrompt />
    </div>
  );
}
