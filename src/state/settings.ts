export type Mode = 'demo' | 'google';

export interface Settings {
  mode: Mode;
  /** OAuth Web client ID. Defaults to VITE_GOOGLE_CLIENT_ID from .env. */
  clientId: string;
  /** "primary" or a dedicated calendar's ID, e.g. a "Tasks" calendar. */
  calendarId: string;
}

const CFG_KEY = 'planner_cfg';
const THEME_KEY = 'planner_theme';

export const envClientId = (): string => (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? '';

function read(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function write(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage unavailable: settings last for this session only */
  }
}

export function loadSettings(): Settings {
  const s: Settings = { mode: 'demo', clientId: '', calendarId: 'primary' };
  try {
    Object.assign(s, JSON.parse(read(CFG_KEY) ?? '{}'));
  } catch {
    /* ignore corrupt settings */
  }
  if (!s.clientId) s.clientId = envClientId();
  return s;
}

export const saveSettings = (s: Settings) => write(CFG_KEY, JSON.stringify(s));

export type Theme = 'dark' | 'light';
export const loadTheme = (): Theme => (read(THEME_KEY) === 'light' ? 'light' : 'dark');
export const saveTheme = (t: Theme) => write(THEME_KEY, t);
