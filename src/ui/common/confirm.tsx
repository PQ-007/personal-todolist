import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { t } from '../i18n';
import { Dialog } from './Dialog';
import { Icon } from './Icon';

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Text of the button that goes ahead, e.g. "Discard". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive: red button and warning icon, and Cancel gets the focus so Enter is safe. */
  danger?: boolean;
}

export interface Choice {
  id: string;
  label: string;
  disabled?: boolean;
}

interface Pending {
  options: ConfirmOptions & { choices?: Choice[] };
  /** The chosen id ("ok" for a plain confirmation), or null when cancelled. */
  resolve: (answer: string | null) => void;
}

let pending: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function ask(options: Pending['options']): Promise<string | null> {
  pending?.resolve(null);
  return new Promise((resolve) => {
    pending = { options, resolve };
    emit();
  });
}

/**
 * Asks a yes/no question in the app's own dialog (instead of the browser's confirm()) and
 * resolves to true when the user goes ahead. A second question replaces an open one, which
 * then resolves as cancelled.
 */
export const confirmDialog = (options: ConfirmOptions): Promise<boolean> => ask(options).then((a) => a !== null);

/** Asks the user to pick one of `choices` (the first enabled one is preselected); null when cancelled. */
export const chooseDialog = (options: ConfirmOptions & { choices: Choice[] }): Promise<string | null> => ask(options);

function answer(value: string | null) {
  const p = pending;
  pending = null;
  emit();
  p?.resolve(value);
}

/** Renders the open question, if any. Mount once, after the app's other dialogs. */
export function ConfirmHost() {
  const current = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => pending,
  );
  return current ? <ConfirmBox key={current.options.title} options={current.options} /> : null;
}

function ConfirmBox({ options }: { options: Pending['options'] }) {
  const { title, message, confirmLabel, cancelLabel, danger, choices } = options;
  const [picked, setPicked] = useState(() => choices?.find((c) => !c.disabled)?.id ?? 'ok');
  const goRef = useRef<HTMLButtonElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);

  // Runs after the dialog has opened (child effects run first), so this focus wins.
  useEffect(() => {
    (danger ? stopRef : goRef).current?.focus();
  }, [danger]);

  return (
    <Dialog label={title} describedBy={message ? 'confirm-msg' : undefined} role="alertdialog" className="confirm" onRequestClose={() => answer(null)}>
      <div className={'cf' + (danger ? ' danger' : '')}>
        <span className="cf-icon" aria-hidden="true">
          <Icon name={choices ? 'repeat' : danger ? 'alert' : 'info'} size={20} />
        </span>
        <div className="cf-text">
          <h2>{title}</h2>
          {message && <p id="confirm-msg">{message}</p>}
          {choices && (
            <div className="cf-choices" role="radiogroup" aria-label={title}>
              {choices.map((c) => (
                <label key={c.id} className={'cf-choice' + (c.disabled ? ' disabled' : '')}>
                  <input type="radio" name="cf-choice" checked={picked === c.id} disabled={c.disabled} onChange={() => setPicked(c.id)} />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="cf-actions">
          <button ref={stopRef} type="button" className="btn" onClick={() => answer(null)}>
            {cancelLabel ?? t('modal.cancel')}
          </button>
          <button ref={goRef} type="button" className={'btn ' + (danger ? 'danger-solid' : 'primary')} onClick={() => answer(picked)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
