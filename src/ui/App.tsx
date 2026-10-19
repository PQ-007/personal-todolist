import { useEffect, useState } from 'react';
import { addMin } from '../domain/dates';
import { planner } from '../state/planner';
import { loadTheme, saveTheme, type Theme } from '../state/settings';
import { SettingsDialog } from './SettingsDialog';
import { Sidebar } from './Sidebar';
import { TaskModal, type ModalTarget } from './TaskModal';
import { Toast } from './Toast';
import { TopBar } from './TopBar';
import { UpdatePrompt } from './UpdatePrompt';
import { WeekView } from './WeekView';

/** Next full hour, the default start for a new task. */
const nextHour = () => {
  const n = new Date();
  return addMin(new Date(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours()), 60);
};

export function App() {
  const [modal, setModal] = useState<ModalTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(loadTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    void planner.refresh();
  }, []);

  const open = (id: string) => setModal({ kind: 'edit', id });
  const create = (start: Date = nextHour()) => setModal({ kind: 'new', start });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as Element | null;
      if (t?.closest('input,textarea,select,dialog,[contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('dialog[open]')) return;
      if (e.key === 'ArrowLeft') planner.shiftWeek(-1);
      else if (e.key === 'ArrowRight') planner.shiftWeek(1);
      else if (e.key === 't') planner.setWeek(new Date());
      else if (e.key === 'n') {
        e.preventDefault();
        create();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <Sidebar onOpen={open} onSettings={() => setSettingsOpen(true)} />
      <main>
        <TopBar
          onNew={() => create()}
          onSettings={() => setSettingsOpen(true)}
          onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        />
        <WeekView onOpen={open} onCreate={create} />
      </main>
      {modal && <TaskModal key={JSON.stringify(modal)} target={modal} onClose={() => setModal(null)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      <Toast />
      <UpdatePrompt />
    </div>
  );
}
