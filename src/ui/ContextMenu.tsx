import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Icon, type IconName } from './Icon';

export type MenuEntry =
  | {
      kind?: 'item';
      label: string;
      icon?: IconName;
      /** Shortcut hint shown on the right, e.g. "Ctrl+C". */
      hint?: string;
      /** Set for on/off items (shown with a check mark). */
      checked?: boolean;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | { kind: 'separator' }
  /** A row of color swatches; `options` maps an id to its CSS color and accessible name. */
  | { kind: 'swatches'; label: string; value: string; options: { id: string; color: string; name: string }[]; onSelect: (id: string) => void };

export interface MenuState {
  x: number;
  y: number;
  label: string;
  items: MenuEntry[];
}

const EDGE = 8;

/**
 * A right-click menu at (x, y), kept inside the viewport. Arrow keys move between items,
 * Enter picks one, and Escape, a click elsewhere, scrolling or resizing close it.
 * Focus returns to whatever had it before.
 */
export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: menu.x, top: menu.y });

  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    setPos({
      left: Math.max(EDGE, Math.min(menu.x, innerWidth - r.width - EDGE)),
      top: Math.max(EDGE, Math.min(menu.y, innerHeight - r.height - EDGE)),
    });
  }, [menu.x, menu.y]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('.ctxitem:not([disabled])')?.focus();
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const close = () => onClose();
    document.addEventListener('pointerdown', onDown, true);
    addEventListener('resize', close);
    addEventListener('blur', close);
    document.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      removeEventListener('resize', close);
      removeEventListener('blur', close);
      document.removeEventListener('scroll', close, true);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [onClose]);

  const onKeyDown = (e: KeyboardEvent) => {
    const items = [...ref.current!.querySelectorAll<HTMLElement>('[role^=menuitem]:not([disabled])')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const move: Record<string, number> = {
      ArrowDown: i + 1,
      ArrowUp: i - 1,
      ArrowRight: i + 1,
      ArrowLeft: i - 1,
      Home: 0,
      End: items.length - 1,
    };
    if (e.key in move) {
      e.preventDefault();
      items[(move[e.key]! + items.length) % items.length]?.focus();
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      ref={ref}
      className="ctxmenu"
      role="menu"
      aria-label={menu.label}
      style={pos}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((item, i) => {
        if (item.kind === 'separator') return <div key={i} className="ctxsep" role="separator" />;
        if (item.kind === 'swatches') {
          return (
            <div key={i} className="ctxswatches" role="group" aria-label={item.label}>
              {item.options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={o.id === item.value}
                  aria-label={o.name}
                  title={o.name}
                  className={'ctxsw' + (o.id === item.value ? ' on' : '')}
                  style={{ '--c': o.color } as CSSProperties}
                  onClick={() => {
                    onClose();
                    item.onSelect(o.id);
                  }}
                />
              ))}
            </div>
          );
        }
        const checkable = item.checked !== undefined;
        return (
          <button
            key={i}
            type="button"
            role={checkable ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={checkable ? item.checked : undefined}
            className={'ctxitem' + (item.danger ? ' danger' : '')}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            <span className="ctxicon">{item.icon && <Icon name={item.icon} size={16} />}</span>
            <span className="ctxlabel">{item.label}</span>
            {checkable ? (
              <span className="ctxcheck">{item.checked && <Icon name="check" size={15} />}</span>
            ) : (
              item.hint && <kbd>{item.hint}</kbd>
            )}
          </button>
        );
      })}
    </div>
  );
}
