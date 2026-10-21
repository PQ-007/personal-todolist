import { useMemo, useState, type KeyboardEvent } from 'react';
import { t } from '../i18n';
import { Dialog } from './Dialog';
import { Icon, type IconName } from './Icon';
import { isImeKey } from './ime';

export interface Command {
  id: string;
  label: string;
  /** Extra words to match, e.g. the English name in another language. */
  keywords?: string;
  /** Shortcut or detail shown on the right. */
  hint?: string;
  icon?: IconName;
  group: 'actions' | 'tasks';
  run: () => void;
}

const MAX_PER_GROUP = 8;

/**
 * Ctrl/⌘+K: type to filter actions and the tasks on screen, arrows to move, Enter to run.
 * Actions come first (typing "month" means the month view, not a task called "Month-end");
 * tasks only appear once something is typed.
 */
export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (c: Command) => !q || `${c.label} ${c.keywords ?? ''}`.toLowerCase().includes(q);
    const actions = commands.filter((c) => c.group === 'actions' && matches(c)).slice(0, q ? MAX_PER_GROUP : 12);
    const tasks = q ? commands.filter((c) => c.group === 'tasks' && matches(c)).slice(0, MAX_PER_GROUP) : [];
    return [...actions, ...tasks];
  }, [commands, query]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = results.length;
      if (n) setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
    } else if (e.key === 'Enter' && !isImeKey(e)) {
      e.preventDefault();
      run(results[active]);
    }
  };

  let lastGroup: Command['group'] | null = null;
  return (
    <Dialog label={t('search.button')} onRequestClose={onClose} className="palette">
      <div className="pal" onKeyDown={onKeyDown}>
        <div className="pal-input">
          <Icon name="search" />
          <input
            autoFocus
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="pal-list"
            aria-activedescendant={results[active] ? `pal-${results[active].id}` : undefined}
            placeholder={t('palette.placeholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <ul id="pal-list" className="pal-list" role="listbox">
          {results.length === 0 && <li className="pal-empty">{t('palette.empty')}</li>}
          {results.map((c, i) => {
            const heading = c.group !== lastGroup ? t(c.group === 'tasks' ? 'palette.tasks' : 'palette.actions') : null;
            lastGroup = c.group;
            return (
              <li key={c.id} role="presentation">
                {heading && <div className="pal-group">{heading}</div>}
                <div
                  id={`pal-${c.id}`}
                  role="option"
                  aria-selected={i === active}
                  className={'pal-item' + (i === active ? ' on' : '')}
                  onMouseMove={() => i !== active && setActive(i)}
                  onClick={() => run(c)}
                >
                  <span className="pal-icon">{c.icon && <Icon name={c.icon} size={16} />}</span>
                  <span className="pal-label">{c.label}</span>
                  {c.hint && <kbd>{c.hint}</kbd>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Dialog>
  );
}
