import { useState } from 'react';
import { loadGis } from '../data/google/auth';
import { LANGS, setLang, t, useLang, type Lang } from '../i18n';
import { planner, usePlanner } from '../state/planner';
import type { Mode, Theme } from '../state/settings';
import { confirmDialog } from './confirm';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { Rich } from './Rich';

interface Props {
  theme: Theme;
  onTheme: (theme: Theme) => void;
  onClose: () => void;
}

export function SettingsDialog({ theme, onTheme, onClose }: Props) {
  const { settings } = usePlanner();
  const lang = useLang();
  const [mode, setMode] = useState<Mode>(settings.mode);
  const [clientId, setClientId] = useState(settings.clientId);
  const [calendarId, setCalendarId] = useState(settings.calendarId);

  const save = () => {
    const cid = clientId.trim();
    if (mode === 'google' && !cid) {
      planner.toast(t('set.needClientId'));
      return;
    }
    onClose();
    // Sign-in must start from this click so the browser allows Google's popup.
    void planner.applySettings({ mode, clientId: cid, calendarId: calendarId.trim() || 'primary' });
  };

  return (
    <Dialog label={t('settings')} onRequestClose={onClose}>
      <form
        className="mwrap setform"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="mhead">
          <h2 style={{ fontSize: 18, flex: 1, margin: 0 }}>{t('settings')}</h2>
          <button type="button" className="x" aria-label={t('modal.close')} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <fieldset className="radio" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="setlegend">{t('set.appearance')}</legend>
          {(['dark', 'light'] as const).map((th) => (
            <label key={th}>
              <input type="radio" name="theme" checked={theme === th} onChange={() => onTheme(th)} />{' '}
              {t(th === 'dark' ? 'set.dark' : 'set.light')}
            </label>
          ))}
        </fieldset>
        <fieldset className="radio" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="setlegend">{t('set.language')}</legend>
          {(Object.keys(LANGS) as Lang[]).map((l) => (
            <label key={l} lang={l}>
              <input type="radio" name="lang" checked={lang === l} onChange={() => setLang(l)} /> {LANGS[l]}
            </label>
          ))}
        </fieldset>
        <fieldset className="radio" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="setlegend">{t('set.source')}</legend>
          <label>
            <input type="radio" name="mode" value="demo" checked={mode === 'demo'} onChange={() => setMode('demo')} /> {t('set.demo')}
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              value="google"
              checked={mode === 'google'}
              onChange={() => {
                setMode('google');
                // Preload Google's script so the sign-in popup opens straight from Save.
                loadGis().catch(() => {});
              }}
            />{' '}
            {t('set.google')}
          </label>
        </fieldset>
        <label className="f">
          {t('set.clientId')}
          <input
            type="text"
            placeholder="1234567890-abc.apps.googleusercontent.com"
            value={clientId}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setClientId(e.target.value)}
          />
        </label>
        <label className="f">
          {t('set.calendarId')}
          <input
            type="text"
            placeholder="primary"
            value={calendarId}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setCalendarId(e.target.value)}
          />
        </label>
        <ol className="steps">
          <li>{t('set.step1')}</li>
          <li>{t('set.step2')}</li>
          <li>
            <Rich text={t('set.step3')} parts={{ origin: <code>{location.origin}</code> }} />
          </li>
          <li>
            <Rich text={t('set.step4')} parts={{ primary: <code>primary</code> }} />
          </li>
        </ol>
        <div className="mfoot">
          <button
            type="button"
            className="btn danger ghost"
            onClick={() => {
              void confirmDialog({
                title: t('confirm.resetTitle'),
                message: t('confirm.resetBody'),
                confirmLabel: t('confirm.reset'),
                danger: true,
              }).then((ok) => ok && planner.resetDemo());
            }}
          >
            {t('set.reset')}
          </button>
          <span className="hint" />
          <button type="button" className="btn" onClick={onClose}>
            {t('modal.cancel')}
          </button>
          <button type="submit" className="btn primary">
            {t('modal.save')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
