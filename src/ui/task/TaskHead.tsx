import type { CSSProperties } from 'react';
import { COLOR_IDS, COLOR_NAMES, colorVars } from '../../domain/colors';
import { t as tr } from '../../i18n';
import { Icon } from '../common/Icon';

/**
 * The task dialog's top row: for a new entry, whether it's a calendar task or a to-do; the
 * color; done (for an existing task); and close.
 */
export function TaskHead({
  isNew,
  todo,
  onTodo,
  colorId,
  onColor,
  done,
  onDone,
  onClose,
}: {
  isNew: boolean;
  todo: boolean;
  onTodo: (todo: boolean) => void;
  colorId: string;
  onColor: (colorId: string) => void;
  done: boolean;
  onDone: (done: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div className="mhead">
      {isNew && (
        <div className="segmented mkind" role="radiogroup" aria-label={tr('add.kind')}>
          {([false, true] as const).map((isTodo) => (
            <button
              key={String(isTodo)}
              type="button"
              role="radio"
              aria-checked={todo === isTodo}
              className={'seg-opt' + (todo === isTodo ? ' on' : '')}
              onClick={() => onTodo(isTodo)}
            >
              <Icon name={isTodo ? 'inbox' : 'clock'} size={16} />
              {tr(isTodo ? 'add.todo' : 'add.event')}
            </button>
          ))}
        </div>
      )}
      <div className="swatches" role="radiogroup" aria-label={tr('modal.color')}>
        {COLOR_IDS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={k === colorId}
            className={'sw' + (k === colorId ? ' on' : '')}
            style={colorVars(k) as CSSProperties}
            aria-label={tr(COLOR_NAMES[k]!)}
            onClick={() => onColor(k)}
          />
        ))}
      </div>
      {!isNew && (
        <label className="donechk">
          <input type="checkbox" checked={done} onChange={(e) => onDone(e.target.checked)} /> {tr('modal.done')}
        </label>
      )}
      <button type="button" className="x" aria-label={tr('modal.close')} onClick={onClose}>
        <Icon name="x" />
      </button>
    </div>
  );
}
