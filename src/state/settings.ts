import { isLabel, type LabelFilter } from '../domain/labels';

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
const LANG_KEY = 'planner_lang';
const FILTER_KEY = 'planner_filter';

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

/** The saved language, else the browser's if supported, else the first of `supported`. */
export function loadLang<L extends string>(supported: L[]): L {
  const is = (x: string | null | undefined): x is L => !!x && (supported as string[]).includes(x);
  const saved = read(LANG_KEY);
  if (is(saved)) return saved;
  const browser = globalThis.navigator?.languages?.map((l) => l.slice(0, 2)).find(is);
  return browser ?? supported[0]!;
}
export const saveLang = (l: string) => write(LANG_KEY, l);

export const loadFilter = (): LabelFilter => {
  const f = read(FILTER_KEY);
  return isLabel(f) ? f : 'all';
};
export const saveFilter = (f: LabelFilter) => write(FILTER_KEY, f);
