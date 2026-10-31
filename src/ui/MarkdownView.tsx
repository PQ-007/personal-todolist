import { Fragment, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import type { Inline, ListItem } from '../domain/markdown/parse';
import { parseMarkdown } from '../domain/markdown/parse';
import { t } from '../i18n';
import { Icon } from './Icon';

type Place = 'before' | 'after';
const MIME = 'application/x-md-item';

interface Props {
  source: string;
  onToggle?: (line: number) => void;
  /** Reordering list items: move the item on line `from` before or after the one on line `to`. */
  onMove?: (from: number, to: number, place: Place) => void;
}

/** Renders markdown as React elements. Text is never interpreted as HTML. */
export function MarkdownView({ source, onToggle, onMove }: Props) {
  const blocks = parseMarkdown(source);
  const [dragLine, setDragLine] = useState<number | null>(null);
  const [drop, setDrop] = useState<{ line: number; place: Place } | null>(null);
  const endDrag = () => {
    setDragLine(null);
    setDrop(null);
  };

  /** Drag (or the handle's arrow keys) to reorder; `list` is the item's list, for the keys. */
  const sortable = (it: ListItem, list: ListItem[]) => {
    if (!onMove) return { className: '', handle: null, props: {} };
    const siblings = (dir: -1 | 1) => {
      const i = list.indexOf(it);
      for (let j = i + dir; j >= 0 && j < list.length; j += dir) {
        if (list[j]!.indent < it.indent) return null;
        if (list[j]!.indent === it.indent) return list[j]!;
      }
      return null;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const other = siblings(e.key === 'ArrowUp' ? -1 : 1);
      if (other) onMove(it.line, other.line, e.key === 'ArrowUp' ? 'before' : 'after');
    };
    const className =
      ' sortable' + (dragLine === it.line ? ' dragging' : '') + (drop?.line === it.line && dragLine !== it.line ? ' drop-' + drop.place : '');
    return {
      className,
      handle: (
        <button type="button" className="md-grip" aria-label={t('md.move')} title={t('md.move')} onKeyDown={onKey}>
          <Icon name="grip" size={14} />
        </button>
      ),
      props: {
        draggable: true,
        onDragStart: (e: DragEvent) => {
          e.stopPropagation();
          e.dataTransfer.setData(MIME, String(it.line));
          e.dataTransfer.effectAllowed = 'move';
          setDragLine(it.line);
        },
        onDragOver: (e: DragEvent<HTMLElement>) => {
          if (dragLine == null) return;
          e.preventDefault();
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          const place = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
          if (drop?.line !== it.line || drop.place !== place) setDrop({ line: it.line, place });
        },
        onDrop: (e: DragEvent) => {
          if (dragLine == null) return;
          e.preventDefault();
          e.stopPropagation();
          if (drop && drop.line !== dragLine) onMove(dragLine, drop.line, drop.place);
          endDrag();
        },
        onDragEnd: endDrag,
      },
    };
  };

  return (
    <div className={'md' + (onMove ? ' md-sortable' : '')}>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'heading': {
            const H = `h${b.level}` as const;
            return <H key={i}>{inline(b.c)}</H>;
          }
          case 'para':
            return <p key={i}>{lines(b.lines)}</p>;
          case 'quote':
            return <blockquote key={i}>{lines(b.lines)}</blockquote>;
          case 'code':
            return (
              <pre key={i}>
                <code>{b.v}</code>
              </pre>
            );
          case 'hr':
            return <hr key={i} />;
          case 'list': {
            const L = b.ordered ? 'ol' : 'ul';
            return (
              <L key={i}>
                {b.items.map((it, j) => {
                  const s = sortable(it, b.items);
                  return it.task ? (
                    <li
                      key={j}
                      className={'task' + (it.task.done ? ' done' : '') + s.className}
                      style={{ marginLeft: `${it.indent * 1.1 - 1.25}em` }}
                      {...s.props}
                    >
                      {s.handle}
                      <label>
                        <input
                          type="checkbox"
                          checked={it.task.done}
                          disabled={!onToggle}
                          onChange={() => onToggle?.(it.task!.line)}
                        />
                        <span>{inline(it.content)}</span>
                      </label>
                    </li>
                  ) : (
                    <li key={j} className={s.className.trim() || undefined} style={{ marginLeft: `${it.indent * 1.1}em` }} {...s.props}>
                      {s.handle}
                      {inline(it.content)}
                    </li>
                  );
                })}
              </L>
            );
          }
        }
      })}
    </div>
  );
}

const lines = (ls: Inline[][]) =>
  ls.map((l, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {inline(l)}
    </Fragment>
  ));

function inline(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text':
        return <Fragment key={i}>{n.v}</Fragment>;
      case 'code':
        return <code key={i}>{n.v}</code>;
      case 'strong':
        return <strong key={i}>{inline(n.c)}</strong>;
      case 'em':
        return <em key={i}>{inline(n.c)}</em>;
      case 'del':
        return <del key={i}>{inline(n.c)}</del>;
      case 'link':
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">
            {inline(n.c)}
          </a>
        );
    }
  });
}
