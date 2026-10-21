import { useRegisterSW } from 'virtual:pwa-register/react';
import { t } from '../i18n';
import { Icon } from './Icon';

/** Offers to reload when a new version of the app has been downloaded. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="toast" role="status" style={{ bottom: 76 }}>
      {t('update.available')}
      <button type="button" className="btn primary" onClick={() => void updateServiceWorker(true)}>
        {t('update.reload')}
      </button>
      <button type="button" className="x" aria-label={t('toast.dismiss')} onClick={() => setNeedRefresh(false)}>
        <Icon name="x" />
      </button>
    </div>
  );
}
