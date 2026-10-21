import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { COLORS, COLOR_NAMES } from '../domain/colors';
import { addDays, addMin, parseYmd, withTime } from '../domain/dates';
import { labelFor, LABELS } from '../domain/labels';
import { t, useLang } from '../i18n';
import { planner, usePlanner } from '../state/planner';
import { loadTheme, saveTheme, type Theme } from '../state/settings';
import { ContextMenu, type MenuState } from './ContextMenu';
import { DayPanel, QUICK_ADD_ID } from './DayPanel';
import { SettingsDialog } from './SettingsDialog';
import { TaskModal, type ModalTarget } from './TaskModal';
import { TaskView } from './TaskView';
import { slotTime, TimeGrid } from './TimeGrid';
import { Toast } from './Toast';
import { TopBar } from './TopBar';
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

/** Next full hour, the default start for a new task. */
const nextHour = () => {
  const n = new Date();
  return addMin(new Date(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours()), 60);
};

export function App() {
  // Subscribing here re-renders the whole tree when the language changes.
  const lang = useLang();
  const { view, day, week } = usePlanner();
  const [modal, setModal] = useState<ModalTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

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
  const create = (start: Date = nextHour()) => setModal({ kind: 'new', start, label: labelFor(planner.get().filter) });
  const closeModal = useCallback(() => setModal(null), []);

  /** Right-click (or long press) on a task, or on empty space in the grid or the day list. */
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

    if (taskEl) {
      const task = planner.find(taskEl.dataset.id!);
      if (!task) return;
      setMenu({
        x,
        y,
        label: t('menu.label'),
        items: [
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
          {
            label: t(task.done ? 'menu.markUndone' : 'panel.markDone'),
            icon: 'check-circle',
            onSelect: () => void planner.toggleDone(task.id),
          },
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
          { label: t('menu.copy'), icon: 'copy', hint: KEYS.copy, onSelect: () => planner.copy(task.id) },
          { kind: 'separator' },
          { label: t('menu.delete'), icon: 'trash', hint: KEYS.del, danger: true, onSelect: () => planner.deleteWithUndo(task.id) },
        ],
      });
      return;
    }

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

  // Shortcuts follow Google Calendar: t today, d/x/w views (x is its custom view), j/k or arrows to move, c to create.
  // Ctrl/⌘+C and Ctrl/⌘+V copy the focused task and paste it on the selected day; Delete removes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as Element | null;
      if (t?.closest('input,textarea,select,dialog,[contenteditable]') || e.altKey) return;
      if (document.querySelector('dialog[open]')) return;
      if (e.ctrlKey || e.metaKey) {
        const id = focusedTaskId();
        if (e.key === 'c' && id && !hasTextSelection()) planner.copy(id);
        else if (e.key === 'v' && planner.get().clipboard) planner.paste(planner.get().day);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const id = focusedTaskId();
        if (id) {
          e.preventDefault();
          planner.deleteWithUndo(id);
        }
        return;
      }
      const { view } = planner.get();
      const step = (n: number) => (view === 'day' ? planner.shiftDay(n) : planner.shiftWeek(n));
      if (e.key === 'ArrowLeft' || e.key === 'k') step(-1);
      else if (e.key === 'ArrowRight' || e.key === 'j') step(1);
      else if (e.key === 't') planner.setDay(new Date());
      else if (e.key === 'd') planner.setView('day');
      else if (e.key === 'x') planner.setView('workweek');
      else if (e.key === 'w') planner.setView('week');
      else if (e.key === 'c') create();
      else if (e.key === 'n') {
        e.preventDefault();
        document.getElementById(QUICK_ADD_ID)?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const days = view === 'day' ? [day] : Array.from({ length: view === 'workweek' ? 5 : 7 }, (_, i) => addDays(week, i));

  return (
    <div className="app" onContextMenu={onContextMenu}>
      <TopBar onSettings={() => setSettingsOpen(true)} />
      <div className="body">
        <DayPanel onOpen={open} onEdit={edit} />
        <main>
          <TimeGrid days={days} onOpen={open} onCreate={create} />
        </main>
      </div>
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
      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
      <Toast />
      <UpdatePrompt />
    </div>
  );
}
