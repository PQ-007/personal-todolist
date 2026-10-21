import { useEffect } from 'react';
import { t } from '../i18n';
import { planner, usePlanner } from '../state/planner';
import { Icon } from './Icon';

export function Toast() {
  const { toast } = usePlanner();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => planner.dismissToast(), toast.action ? 7000 : 4200);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <div className="toast" role="status" aria-live="polite" hidden={!toast}>
      {toast?.msg}
      {toast?.action && (
        <button
          type="button"
          className="linkbtn"
          onClick={() => {
            toast.action!.run();
            planner.dismissToast();
          }}
        >
          {toast.action.label}
        </button>
      )}
      {toast && (
        <button type="button" className="x" aria-label={t('toast.dismiss')} onClick={() => planner.dismissToast()}>
          <Icon name="x" />
        </button>
      )}
    </div>
  );
}
