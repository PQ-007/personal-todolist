/// <reference types="node" />
/**
 * Keeps the app signed in to Google across visits (Netlify Function).
 *
 * Sign-in is Google's authorization-code flow with offline access: this function swaps the code
 * for a refresh token and keeps it in an httpOnly cookie, then hands the app a fresh one-hour
 * access token whenever it asks. The client secret and the refresh token never reach page
 * scripts.
 *
 *   GET  /api/auth/status    { configured }
 *   GET  /api/auth/start     → Google's consent page
 *   GET  /api/auth/callback  ← Google; sets the cookie, back to /
 *   POST /api/auth/refresh   { access_token, expires_in } | 401 when signed out
 *   POST /api/auth/logout    revokes the refresh token and clears the cookie
 *
 * Needs GOOGLE_CLIENT_SECRET plus GOOGLE_CLIENT_ID (or VITE_GOOGLE_CLIENT_ID) in the site's
 * environment, and https://<site>/api/auth/callback as an authorized redirect URI.
 */

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
/** Refresh token. Strict: only the app's own requests carry it. */
const RT_COOKIE = '__Host-planner_rt';
/** Anti-forgery state for one sign-in. Lax, since Google's redirect back is cross-site. */
const STATE_COOKIE = '__Host-planner_state';
const RT_MAX_AGE = 60 * 60 * 24 * 400;

interface GoogleToken {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

const env = (key: string) => process.env[key]?.trim() ?? '';
const clientId = () => env('GOOGLE_CLIENT_ID') || env('VITE_GOOGLE_CLIENT_ID');
const clientSecret = () => env('GOOGLE_CLIENT_SECRET');

function readCookie(req: Request, name: string): string {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return '';
}

const cookie = (name: string, value: string, maxAge: number, sameSite: 'Strict' | 'Lax') =>
  `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=${sameSite}`;

function reply(body: unknown, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

function redirect(to: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: to, 'Cache-Control': 'no-store' });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers });
}

async function tokenRequest(params: Record<string, string>): Promise<{ ok: boolean; body: GoogleToken }> {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...params }),
  });
  return { ok: r.ok, body: ((await r.json().catch(() => ({}))) as GoogleToken) ?? {} };
}

/** POSTs must come from the app itself (on top of the SameSite cookie). */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  try {
    return !!origin && new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const action = url.pathname.split('/').pop();
  const configured = !!(clientId() && clientSecret());
  const callbackUrl = `${url.origin}/api/auth/callback`;

  if (req.method === 'GET' && action === 'status') return reply({ configured });
  if (!configured) return reply({ error: 'not_configured' }, 501);

  if (req.method === 'GET' && action === 'start') {
    const state = crypto.randomUUID();
    const q = new URLSearchParams({
      client_id: clientId(),
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: SCOPE,
      // offline + consent: Google only returns a refresh token on an explicit consent.
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return redirect(`${AUTH_URL}?${q}`, [cookie(STATE_COOKIE, state, 600, 'Lax')]);
  }

  if (req.method === 'GET' && action === 'callback') {
    const clearState = cookie(STATE_COOKIE, '', 0, 'Lax');
    const fail = (why: string) => redirect(`/?auth=${encodeURIComponent(why)}`, [clearState]);
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (url.searchParams.get('error')) return fail(url.searchParams.get('error')!);
    if (!code || !state || state !== readCookie(req, STATE_COOKIE)) return fail('state');
    const { ok, body } = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: callbackUrl });
    if (!ok || !body.refresh_token) return fail(body.error || 'exchange');
    // With granular consent the calendar box can be left unticked.
    if (!body.scope?.split(' ').includes(SCOPE)) return fail('scope');
    return redirect('/', [clearState, cookie(RT_COOKIE, body.refresh_token, RT_MAX_AGE, 'Strict')]);
  }

  if (req.method !== 'POST') return reply({ error: 'not_found' }, 404);
  if (!sameOrigin(req)) return reply({ error: 'forbidden' }, 403);
  const refreshToken = readCookie(req, RT_COOKIE);
  const clearRt = cookie(RT_COOKIE, '', 0, 'Strict');

  if (action === 'refresh') {
    if (!refreshToken) return reply({ error: 'signed_out' }, 401);
    const { ok, body } = await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' });
    // invalid_grant: revoked, expired or password changed. Sign-in is needed again.
    if (body.error === 'invalid_grant') return reply({ error: 'signed_out' }, 401, [clearRt]);
    if (!ok || !body.access_token) return reply({ error: body.error || 'refresh_failed' }, 502);
    return reply({ access_token: body.access_token, expires_in: body.expires_in });
  }

  if (action === 'logout') {
    if (refreshToken) {
      await fetch(REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }),
      }).catch(() => {});
    }
    return reply(null, 204, [clearRt]);
  }

  return reply({ error: 'not_found' }, 404);
};

export const config = { path: '/api/auth/:action' };
