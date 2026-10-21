import { useEffect, useRef, useSyncExternalStore } from 'react';
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

interface Pending {
  options: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

let pending: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/**
 * Asks a yes/no question in the app's own dialog (instead of the browser's confirm()) and
 * resolves to true when the user goes ahead. A second call replaces an open question, which
 * then resolves to false.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  pending?.resolve(false);
  return new Promise((resolve) => {
    pending = { options, resolve };
    emit();
  });
}

function answer(ok: boolean) {
  const p = pending;
  pending = null;
  emit();
  p?.resolve(ok);
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

function ConfirmBox({ options }: { options: ConfirmOptions }) {
  const { title, message, confirmLabel, cancelLabel, danger } = options;
  const goRef = useRef<HTMLButtonElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);

  // Runs after the dialog has opened (child effects run first), so this focus wins.
  useEffect(() => {
    (danger ? stopRef : goRef).current?.focus();
  }, [danger]);

  return (
    <Dialog label={title} describedBy={message ? 'confirm-msg' : undefined} role="alertdialog" className="confirm" onRequestClose={() => answer(false)}>
      <div className={'cf' + (danger ? ' danger' : '')}>
        <span className="cf-icon" aria-hidden="true">
          <Icon name={danger ? 'alert' : 'info'} size={20} />
        </span>
        <div className="cf-text">
          <h2>{title}</h2>
          {message && <p id="confirm-msg">{message}</p>}
        </div>
        <div className="cf-actions">
          <button ref={stopRef} type="button" className="btn" onClick={() => answer(false)}>
            {cancelLabel ?? t('modal.cancel')}
          </button>
          <button ref={goRef} type="button" className={'btn ' + (danger ? 'danger-solid' : 'primary')} onClick={() => answer(true)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
