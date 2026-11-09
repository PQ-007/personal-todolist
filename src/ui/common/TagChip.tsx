import type { CSSProperties } from 'react';
import { tagHue } from '../domain/tags';

/** A #tag in its own stable color. With `onClick` it is a button (e.g. to filter by the tag). */
export function TagChip({ tag, active, title, onClick }: { tag: string; active?: boolean; title?: string; onClick?: () => void }) {
  const style = { '--h': tagHue(tag) } as CSSProperties;
  const cls = 'tag' + (active ? ' on' : '');
  if (!onClick) {
    return (
      <span className={cls} style={style}>
        #{tag}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      style={style}
      title={title}
      aria-pressed={active}
      draggable={false}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      #{tag}
    </button>
  );
}
