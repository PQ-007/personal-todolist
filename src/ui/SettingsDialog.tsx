import { useState } from 'react';
import { loadGis } from '../data/google/auth';
import { planner, usePlanner } from '../state/planner';
import type { Mode } from '../state/settings';
import { Dialog } from './Dialog';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { settings } = usePlanner();
  const [mode, setMode] = useState<Mode>(settings.mode);
  const [clientId, setClientId] = useState(settings.clientId);
  const [calendarId, setCalendarId] = useState(settings.calendarId);

  const save = () => {
    const cid = clientId.trim();
    if (mode === 'google' && !cid) {
      planner.toast('Paste your OAuth client ID first.');
      return;
    }
    onClose();
    // Sign-in must start from this click so the browser allows Google's popup.
    void planner.applySettings({ mode, clientId: cid, calendarId: calendarId.trim() || 'primary' });
  };

  return (
    <Dialog label="Settings" onRequestClose={onClose}>
      <form
        className="mwrap setform"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="mhead">
          <h2 style={{ fontSize: 18, flex: 1, margin: 0 }}>Settings</h2>
          <button type="button" className="x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <fieldset className="radio" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sr-only">Data source</legend>
          <label>
            <input type="radio" name="mode" value="demo" checked={mode === 'demo'} onChange={() => setMode('demo')} /> Demo data
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
            Google Calendar
          </label>
        </fieldset>
        <label className="f">
          OAuth client ID
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
          Calendar ID
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
          <li>
            In Google Cloud Console, create a project and enable the <b>Google Calendar API</b>.
          </li>
          <li>Set up the OAuth consent screen (External) and add your Google account as a test user.</li>
          <li>
            Create an <b>OAuth client ID</b> of type Web application and add this site’s address (
            <code>{location.origin}</code>) under authorized JavaScript origins.
          </li>
          <li>
            Paste the client ID above. For a dedicated task calendar, create a “Tasks” calendar in Google Calendar and
            paste its ID from Calendar settings → Integrate calendar. Leave it as <code>primary</code> to use your main
            calendar.
          </li>
        </ol>
        <div className="mfoot">
          <button
            type="button"
            className="btn danger ghost"
            onClick={() => {
              if (confirm('Replace demo data with the sample week?')) planner.resetDemo();
            }}
          >
            Reset demo data
          </button>
          <span className="hint" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}
