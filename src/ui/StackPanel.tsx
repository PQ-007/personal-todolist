import { useState, type CSSProperties, type DragEvent, type MouseEvent } from 'react';
import { colorOf } from '../domain/colors';
import { matchesFilter } from '../domain/labels';
import type { StackItem } from '../domain/stack';
import { extractTags, formatTags, normalizeTags } from '../domain/tags';
import { fmtDuration, t } from '../i18n';
import { planner, usePlanner } from '../state/planner';
import type { MenuState } from './ContextMenu';
import { isStackDrag, STACK_MIME, stackDrag } from './dnd';
import { Icon } from './Icon';
import { isImeKey } from './ime';
import { LabelTag } from './LabelTag';
import { stackItemMenu } from './stackMenu';
import { TagChip } from './TagChip';

const sameTag = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
/** What the inline editor shows: the title followed by its #tags. */
const textOf = (item: StackItem) => [item.title, formatTags(item.tags)].filter(Boolean).join(' ');

/**
 * To-dos without a time: add them here, reorder them by dragging, and drag one onto the
 * calendar (or use its menu) to schedule it. Calendar cards dropped here move back.
 */
export function StackPanel({ onMenu, onAdd }: { onMenu: (menu: MenuState) => void; onAdd: () => void }) {
  const { stack, filter } = usePlanner();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const labelled = stack.filter((s) => matchesFilter(s, filter));
  const allTags = normalizeTags(labelled.flatMap((s) => s.tags ?? [])).sort((a, b) => a.localeCompare(b));
  // A tag that no longer exists (renamed or removed) stops filtering.
  const activeTag = tagFilter && allTags.some((t) => sameTag(t, tagFilter)) ? tagFilter : null;
  const items = activeTag ? labelled.filter((s) => s.tags?.some((t) => sameTag(t, activeTag))) : labelled;

  const saveText = (item: StackItem, value: string) => {
    const { text: title, tags } = extractTags(value);
    if (title) planner.updateStackItem(item.id, { title, tags });
    setRenaming(null);
  };

  const openMenu = (item: StackItem, x: number, y: number) =>
    onMenu({
      x,
      y,
      label: item.title,
      items: stackItemMenu(item, () => setRenaming(item.id)),
    });

  /** Reordering: where in the list a dragged item would land. */
  const onItemDragOver = (e: DragEvent<HTMLLIElement>, index: number) => {
    if (!isStackDrag(e)) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    setDropAt(index + (e.clientY > r.top + r.height / 2 ? 1 : 0));
  };
  const onListDrop = (e: DragEvent) => {
    if (!isStackDrag(e) || dropAt == null) return;
    e.preventDefault();
    // `dropAt` counts filtered items; map it back to a position in the full stack.
    const target = items[dropAt];
    const index = target ? stack.indexOf(target) : stack.length;
    planner.moveStackItem(stackDrag.item!.id, index);
    setDropAt(null);
  };

  return (
    <section
      className="stack"
      aria-labelledby="stack-h"
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropAt(null)}
    >
      <div className="stack-head">
        <h2 id="stack-h">{t('stack.title')}</h2>
        {items.length > 0 && <span className="stack-count">{items.length}</span>}
        <button type="button" className="iconbtn stack-addbtn" aria-label={t('palette.addTodo')} title={`${t('palette.addTodo')} (N)`} onClick={onAdd}>
          <Icon name="plus" />
        </button>
      </div>


      {allTags.length > 0 && (
        <div className="stack-tags" role="group" aria-label={t('tags.filter')}>
          <button
            type="button"
            className={'tag all' + (activeTag ? '' : ' on')}
            aria-pressed={!activeTag}
            onClick={() => setTagFilter(null)}
          >
            {t('tags.all')}
          </button>
          {allTags.map((tag) => (
            <TagChip
              key={tag}
              tag={tag}
              active={!!activeTag && sameTag(tag, activeTag)}
              title={t('tags.filterBy', { tag })}
              onClick={() => setTagFilter(activeTag && sameTag(tag, activeTag) ? null : tag)}
            />
          ))}
        </div>
      )}

      {items.length > 0 ? (
        <ul className="stack-list" onDragOver={(e) => isStackDrag(e) && e.preventDefault()} onDrop={onListDrop}>
          {items.map((item, i) => (
            <li
              key={item.id}
              className={'scard' + (dropAt === i ? ' drop-before' : '') + (dropAt === i + 1 && i === items.length - 1 ? ' drop-after' : '')}
              style={{ '--c': colorOf(item.colorId) } as CSSProperties}
              draggable={renaming !== item.id}
              title={t('stack.dragHint')}
              onDragStart={(e) => {
                stackDrag.item = item;
                e.dataTransfer.setData(STACK_MIME, item.id);
                e.dataTransfer.setData('text/plain', item.title);
                e.dataTransfer.effectAllowed = 'move';
                e.currentTarget.classList.add('dragging');
              }}
              onDragEnd={(e) => {
                stackDrag.item = null;
                e.currentTarget.classList.remove('dragging');
                setDropAt(null);
              }}
              onDragOver={(e) => onItemDragOver(e, i)}
              onContextMenu={(e) => {
                if (renaming === item.id) return;
                e.preventDefault();
                e.stopPropagation();
                openMenu(item, e.clientX, e.clientY);
              }}
              onDoubleClick={() => setRenaming(item.id)}
            >
              <span className="scard-grip" aria-hidden="true">
                <Icon name="grip" size={14} />
              </span>
              {renaming === item.id ? (
                <input
                  className="scard-rename"
                  defaultValue={textOf(item)}
                  aria-label={t('stack.editText')}
                  placeholder={t('tags.placeholder')}
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) => saveText(item, e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isImeKey(e)) e.currentTarget.blur();
                    else if (e.key === 'Escape') {
                      e.currentTarget.value = textOf(item);
                      e.currentTarget.blur();
                    }
                  }}
                />
              ) : (
                <span className="scard-title">{item.title}</span>
              )}
              <span className="scard-meta">
                {item.label && <LabelTag label={item.label} iconOnly />}
                <span className="scard-len">{fmtDuration(item.minutes)}</span>
              </span>
              <button
                type="button"
                className="iconbtn scard-more"
                aria-label={t('stack.more', { title: item.title })}
                aria-haspopup="menu"
                onClick={(e: MouseEvent<HTMLButtonElement>) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  openMenu(item, r.left, r.bottom + 4);
                }}
              >
                <Icon name="more" size={16} />
              </button>
              {renaming !== item.id && item.tags && item.tags.length > 0 && (
                <div className="scard-tags">
                  {item.tags.map((tag) => (
                    <TagChip
                      key={tag}
                      tag={tag}
                      active={!!activeTag && sameTag(tag, activeTag)}
                      title={t('tags.filterBy', { tag })}
                      onClick={() => setTagFilter(tag)}
                    />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : stack.length > 0 ? (
        // There are to-dos, but the label or tag filter hides them all.
        <div className="stack-empty">
          <p className="stack-empty-title">{t('stack.emptyFiltered')}</p>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setTagFilter(null);
              planner.setFilter('all');
            }}
          >
            {t('stack.showAll')}
          </button>
        </div>
      ) : (
        // Empty: explain both ways in and out.
        <div className="stack-empty">
          <Icon name="inbox" size={22} />
          <p className="stack-empty-title">{t('stack.empty')}</p>
          <p>{t('stack.emptyHint')}</p>
          <button type="button" className="btn" onClick={onAdd}>
            <Icon name="plus" size={16} />
            {t('palette.addTodo')}
          </button>
        </div>
      )}
      {items.length > 0 && (
        <p className="stack-drop" aria-hidden="true">
          {t('stack.dropHint')}
        </p>
      )}
    </section>
  );
}
