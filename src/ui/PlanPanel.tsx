import { t } from '../i18n';
import type { MenuState } from './ContextMenu';
import { StackPanel } from './StackPanel';

/** Plan mode's right panel: the to-dos waiting to be dragged onto the calendar. */
export function PlanPanel({ onMenu }: { onMenu: (menu: MenuState) => void }) {
  return (
    <aside className="planpanel" aria-label={t('panel.toggle')}>
      <StackPanel onMenu={onMenu} />
    </aside>
  );
}
