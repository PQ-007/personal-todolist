import { useEffect } from 'react';
import { planner, usePlanner } from '../state/planner';

export function Toast() {
  const { toast } = usePlanner();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => planner.dismissToast(), 4200);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <div className="toast" role="status" aria-live="polite" hidden={!toast}>
      {toast?.msg}
      {toast && (
        <button type="button" className="x" aria-label="Dismiss" onClick={() => planner.dismissToast()}>
          ×
        </button>
      )}
    </div>
  );
}
