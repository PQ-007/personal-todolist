import { t } from '../../i18n';
import { AuthError } from '../store';

/**
 * Google Identity Services token flow. Access tokens last about an hour and are kept in
 * memory plus sessionStorage (so a reload doesn't force a new sign-in). No refresh tokens.
 */

export const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const TOKEN_KEY = 'planner_tok';
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

/** The current access token, or an AuthError when the user must sign in again. */
export function getToken(): string {
  if (!hasToken()) throw new AuthError();
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

/** Opens Google's consent popup (or returns at once if consent was already given). */
export async function signIn(clientId: string): Promise<void> {
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

export function signOut() {
  const t = token;
  clearToken();
  if (t) window.google?.accounts?.oauth2?.revoke(t);
}
