import { lazy, Suspense, useState } from 'react';
import { moveListItem } from '../../domain/markdown/lists';
import { countTasks } from '../../domain/markdown/tasks';
import { t as tr } from '../../i18n';
import { Rich } from '../common/Rich';
import { MarkdownView } from '../markdown/MarkdownView';

// CodeMirror is only needed once a task is being edited.
const MarkdownEditor = lazy(() => import('../markdown/MarkdownEditor'));

/**
 * A task's notes: written as markdown, or shown with checklists that can be ticked (`onToggle`,
 * which saves at once) and reordered. Shows the checklist's progress.
 */
export function NotesTabs({ value, onChange, onToggle }: { value: string; onChange: (value: string) => void; onToggle: (line: number) => void }) {
  const [tab, setTab] = useState<'view' | 'edit'>('edit');
  const { t, d } = countTasks(value);
  return (
    <>
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'edit'}
          className={'tab' + (tab === 'edit' ? ' on' : '')}
          onClick={() => {
            setTab('edit');
            requestAnimationFrame(() => document.getElementById('m-desc')?.focus());
          }}
        >
          {tr('modal.editMarkdown')}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'view'} className={'tab' + (tab === 'view' ? ' on' : '')} onClick={() => setTab('view')}>
          {tr('modal.notes')}
        </button>
        {t > 0 && (
          <div className="prog" aria-label={tr('modal.checklistProgress', { done: d, total: t })}>
            <span>
              <i style={{ width: `${Math.round((d / t) * 100)}%` }} />
            </span>
            {tr('modal.doneCount', { done: d, total: t })}
          </div>
        )}
      </div>

      <div className="mbody" role="tabpanel">
        {tab === 'view' ? (
          value.trim() ? (
            <MarkdownView source={value} onToggle={onToggle} onMove={(from, to, place) => onChange(moveListItem(value, from, to, place))} />
          ) : (
            <p className="empty">
              <Rich text={tr('modal.noNotes')} parts={{ code: <code>- [ ] item</code> }} />
            </p>
          )
        ) : (
          <Suspense fallback={<div className="mdedit" />}>
            <MarkdownEditor value={value} onChange={onChange} />
          </Suspense>
        )}
      </div>
    </>
  );
}
