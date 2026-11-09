import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

interface Props {
  label: string;
  /** Called on Escape, backdrop click or a close button; return false to keep the dialog open. */
  onRequestClose: () => void;
  children: ReactNode;
  className?: string;
  /** "alertdialog" for warnings that need an answer. */
  role?: 'dialog' | 'alertdialog';
  /** Id of the element that explains the dialog (read after its label). */
  describedBy?: string;
}

/**
 * A modal built on <dialog>: focus is trapped by the browser, Escape and backdrop clicks ask
 * to close, and focus goes back to whatever was focused before it opened.
 */
export function Dialog({ label, onRequestClose, children, className, role, describedBy }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const downOnBackdrop = useRef(false);
  const close = useRef(onRequestClose);
  useLayoutEffect(() => {
    close.current = onRequestClose;
  });

  const mounted = useRef(false);

  useEffect(() => {
    const d = ref.current!;
    const opener = document.activeElement as HTMLElement | null;
    mounted.current = true;
    if (!d.open) d.showModal();
    return () => {
      mounted.current = false;
      if (d.open) d.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      aria-describedby={describedBy}
      role={role === 'alertdialog' ? 'alertdialog' : undefined}
      className={className}
      onCancel={(e) => {
        e.preventDefault();
        close.current();
      }}
      onClose={() => {
        // Some browsers force-close on a repeated Escape. Reopen and let the owner decide.
        if (mounted.current && !ref.current!.open) {
          ref.current!.showModal();
          close.current();
        }
      }}
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (e.target === ref.current && downOnBackdrop.current) close.current();
      }}
    >
      {children}
    </dialog>
  );
}
