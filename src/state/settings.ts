import { isLabel, type LabelFilter } from '../domain/labels';
import { clampSpan, type View } from '../domain/views';

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
const VIEW_KEY = 'planner_view';

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

const VIEWS: View[] = ['day', 'workweek', 'week', 'month'];
export function loadView(): { view: View; span: number } {
  try {
    const v = JSON.parse(read(VIEW_KEY) ?? '{}') as { view?: View; span?: number };
    return { view: v.view && VIEWS.includes(v.view) ? v.view : 'workweek', span: clampSpan(v.span ?? 1) };
  } catch {
    return { view: 'workweek', span: 1 };
  }
}
export const saveView = (v: { view: View; span: number }) => write(VIEW_KEY, JSON.stringify(v));

const STACK_OPEN_KEY = 'planner_stack_open';
/** The side panel starts open on wide screens (on narrow ones it would cover the calendar). */
export const loadStackOpen = () => {
  const saved = read(STACK_OPEN_KEY);
  return saved ? saved === '1' : (globalThis.innerWidth ?? 1280) > 980;
};
export const saveStackOpen = (open: boolean) => write(STACK_OPEN_KEY, open ? '1' : '0');

const MODE_KEY = 'planner_mode';
/** The app opens in focus mode unless the user last left it in plan mode. */
export const loadMode = (): 'focus' | 'plan' => (read(MODE_KEY) === 'plan' ? 'plan' : 'focus');
export const saveMode = (m: 'focus' | 'plan') => write(MODE_KEY, m);
