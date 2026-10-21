import { useState } from 'react';
import { loadGis } from '../data/google/auth';
import { LANGS, setLang, t, useLang, type Lang } from '../i18n';
import { planner, usePlanner } from '../state/planner';
import type { Mode, Theme } from '../state/settings';
import { confirmDialog } from './confirm';
import { Dialog } from './Dialog';
import { Icon, type IconName } from './Icon';
import { Rich } from './Rich';

interface Props {
  theme: Theme;
  onTheme: (theme: Theme) => void;
  onClose: () => void;
}

/** A row of mutually exclusive choices that apply at once. */
function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: { id: T; label: string; icon?: IconName; lang?: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          lang={o.lang}
          className={'seg-opt' + (value === o.id ? ' on' : '')}
          onClick={() => onChange(o.id)}
        >
          {o.icon && <Icon name={o.icon} size={16} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Settings in three parts: appearance and language apply at once; the calendar (demo or
 * Google) is saved with Save, and its Google details only show when Google is chosen.
 */
export function SettingsDialog({ theme, onTheme, onClose }: Props) {
  const { settings, needAuth } = usePlanner();
  const lang = useLang();
  const [mode, setMode] = useState<Mode>(settings.mode);
  const [clientId, setClientId] = useState(settings.clientId);
  const [calendarId, setCalendarId] = useState(settings.calendarId);
  const dirty = mode !== settings.mode || clientId.trim() !== settings.clientId || (calendarId.trim() || 'primary') !== settings.calendarId;
  const connected = settings.mode === 'google' && !needAuth;

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

  const sources: { id: Mode; title: string; desc: string; icon: IconName }[] = [
    { id: 'demo', title: t('set.demo'), desc: t('set.demoDesc'), icon: 'all' },
    { id: 'google', title: t('set.google'), desc: t('set.googleDesc'), icon: 'week' },
  ];

  return (
    <Dialog label={t('settings')} onRequestClose={onClose} className="settings">
      <form
        className="st"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) save();
          else onClose();
        }}
      >
        <header className="st-head">
          <h2>{t('settings')}</h2>
          <button type="button" className="x" aria-label={t('modal.close')} onClick={onClose}>
            <Icon name="x" />
          </button>
        </header>

        <div className="st-body">
          <section className="st-row">
            <h3>{t('set.appearance')}</h3>
            <Segmented
              label={t('set.appearance')}
              value={theme}
              onChange={onTheme}
              options={[
                { id: 'dark', label: t('set.dark'), icon: 'moon' },
                { id: 'light', label: t('set.light'), icon: 'sun' },
              ]}
            />
          </section>

          <section className="st-row">
            <h3>{t('set.language')}</h3>
            <Segmented
              label={t('set.language')}
              value={lang}
              onChange={(l: Lang) => setLang(l)}
              options={(Object.keys(LANGS) as Lang[]).map((l) => ({ id: l, label: LANGS[l], lang: l }))}
            />
          </section>

          <section className="st-block">
            <h3>{t('set.source')}</h3>
            <div className="sources" role="radiogroup" aria-label={t('set.source')}>
              {sources.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === s.id}
                  className={'source' + (mode === s.id ? ' on' : '')}
                  onClick={() => {
                    setMode(s.id);
                    // Preload Google's script so the sign-in popup opens straight from Save.
                    if (s.id === 'google') loadGis().catch(() => {});
                  }}
                >
                  <span className="source-icon">
                    <Icon name={s.icon} size={18} />
                  </span>
                  <span className="source-text">
                    <b>{s.title}</b>
                    <span>{s.desc}</span>
                  </span>
                  <span className="source-check" aria-hidden="true">
                    {mode === s.id && <Icon name="check" size={14} />}
                  </span>
                </button>
              ))}
            </div>

            {mode === 'demo' ? (
              <div className="st-sub">
                <button
                  type="button"
                  className="linkbtn danger"
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
              </div>
            ) : (
              <div className="st-sub">
                {settings.mode === 'google' && (
                  <div className={'st-status' + (connected ? ' ok' : '')}>
                    <span className="dot" aria-hidden="true" />
                    {t(connected ? 'set.connected' : 'set.notConnected')}
                    {!connected && (
                      <button type="button" className="btn primary" onClick={() => void planner.connect()}>
                        {t('auth.connect')}
                      </button>
                    )}
                  </div>
                )}
                <label className="st-field">
                  <span>{t('set.clientId')}</span>
                  <input
                    type="text"
                    placeholder="1234567890-abc.apps.googleusercontent.com"
                    value={clientId}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => setClientId(e.target.value)}
                  />
                </label>
                <label className="st-field">
                  <span>{t('set.calendarId')}</span>
                  <input
                    type="text"
                    placeholder="primary"
                    value={calendarId}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => setCalendarId(e.target.value)}
                  />
                  <small>{t('set.calendarHint')}</small>
                </label>
                <details className="st-guide">
                  <summary>{t('set.guide')}</summary>
                  <ol>
                    <li>{t('set.step1')}</li>
                    <li>{t('set.step2')}</li>
                    <li>
                      <Rich text={t('set.step3')} parts={{ origin: <code>{location.origin}</code> }} />
                    </li>
                    <li>
                      <Rich text={t('set.step4')} parts={{ primary: <code>primary</code> }} />
                    </li>
                  </ol>
                </details>
              </div>
            )}
          </section>
        </div>

        <footer className="st-foot">
          {dirty ? (
            <>
              <button type="button" className="btn" onClick={onClose}>
                {t('modal.cancel')}
              </button>
              <button type="submit" className="btn primary">
                {t('modal.save')}
              </button>
            </>
          ) : (
            <button type="submit" className="btn primary">
              {t('set.done')}
            </button>
          )}
        </footer>
      </form>
    </Dialog>
  );
}
