import { useRegisterSW } from 'virtual:pwa-register/react';

/** Offers to reload when a new version of the app has been downloaded. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="toast" role="status" style={{ bottom: 76 }}>
      A new version is available.
      <button type="button" className="btn primary" onClick={() => void updateServiceWorker(true)}>
        Reload
      </button>
      <button type="button" className="x" aria-label="Dismiss" onClick={() => setNeedRefresh(false)}>
        ×
      </button>
    </div>
  );
}
