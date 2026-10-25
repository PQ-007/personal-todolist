import { t } from '../../i18n';
import { AuthError } from '../store';

/**
 * Google sign-in. Where the auth function is deployed (netlify/functions/auth.ts), you sign in
 * once: it keeps a refresh token in an httpOnly cookie and hands out fresh access tokens, so
 * closing the window or the hour running out doesn't sign you out. Elsewhere (the plain Vite
 * dev server) it falls back to Google Identity Services' token flow, which lasts about an hour.
 * Access tokens are kept in memory plus sessionStorage (so a reload needs no round trip).
 */

export const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const TOKEN_KEY = 'planner_tok';
const API = '/api/auth';
/** Treat the token as expired a minute early so requests don't race the expiry. */
const EARLY_MS = 60_000;

interface TokenResponse {
  access_token?: string;
  expires_in?: string | number;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(opts?: { prompt?: string }): void;
}
declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient(cfg: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type?: string; message?: string }) => void;
          }): TokenClient;
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

let token: string | null = null;
let expiresAt = 0;

export function restoreToken() {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as { tok: string; exp: number } | null;
    if (t && t.exp > Date.now()) {
      token = t.tok;
      expiresAt = t.exp;
    }
  } catch {
    /* storage unavailable */
  }
}

function setToken(tok: string, secs: number) {
  token = tok;
  expiresAt = Date.now() + secs * 1000 - EARLY_MS;
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ tok, exp: expiresAt }));
  } catch {
    /* storage unavailable */
  }
}

export function clearToken() {
  token = null;
  expiresAt = 0;
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export const hasToken = () => !!token && Date.now() < expiresAt;

let serverCheck: Promise<boolean> | null = null;
/** Whether the auth function is deployed and configured (false on the Vite dev server). */
function hasServer(): Promise<boolean> {
  serverCheck ??= fetch(`${API}/status`, { headers: { Accept: 'application/json' } })
    .then(async (r) => r.ok && !!r.headers.get('content-type')?.includes('json') && ((await r.json()) as { configured?: boolean }).configured === true)
    .catch(() => {
      // Offline: ask again next time.
      serverCheck = null;
      return false;
    });
  return serverCheck;
}

/** Set once the server says there's no session, so signed-out screens don't keep asking. */
let signedOut = false;
let refreshing: Promise<boolean> | null = null;

/** A fresh access token from the auth function's cookie session; false when there's none. */
function refreshFromServer(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const r = await fetch(`${API}/refresh`, { method: 'POST' });
      if (r.status === 401) signedOut = true;
      const j = (await r.json().catch(() => ({}))) as TokenResponse;
      if (!r.ok || !j.access_token) return false;
      setToken(j.access_token, Number(j.expires_in) || 3600);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** True when there is a usable access token, renewing it through the auth function if needed. */
export async function ensureToken(): Promise<boolean> {
  if (hasToken()) return true;
  if (signedOut || !(await hasServer())) return false;
  return refreshFromServer();
}

/** The current access token, or an AuthError when the user must sign in again. */
export async function getToken(): Promise<string> {
  if (!(await ensureToken())) throw new AuthError();
  return token!;
}

let gisLoading: Promise<void> | null = null;
export function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisLoading = null;
      s.remove();
      reject(new Error(t('err.gisLoad')));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

/**
 * Signs in. With the auth function this leaves the page for Google's consent screen and comes
 * back signed in for good; otherwise it opens the token flow's popup (or returns at once if
 * consent was already given).
 */
export async function signIn(clientId: string): Promise<void> {
  if (await hasServer()) {
    location.assign(`${API}/start`);
    // The page is unloading; never settle.
    return new Promise<void>(() => {});
  }
  if (!clientId) throw new Error(t('err.noClientId'));
  await loadGis();
  const oauth2 = window.google!.accounts!.oauth2!;
  await new Promise<void>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) return reject(new Error(r.error_description || r.error || t('err.signIn')));
        setToken(r.access_token, Number(r.expires_in) || 3600);
        resolve();
      },
      error_callback: (e) =>
        reject(new Error(e.type === 'popup_closed' ? t('err.popupClosed') : e.message || e.type || t('err.signIn'))),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

export async function signOut() {
  const t = token;
  clearToken();
  signedOut = true;
  if (await hasServer()) await fetch(`${API}/logout`, { method: 'POST' }).catch(() => {});
  else if (t) window.google?.accounts?.oauth2?.revoke(t);
}
