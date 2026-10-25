// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../netlify/functions/auth';

const SITE = 'https://week.example.app';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

const get = (path: string, cookie = '') => handler(new Request(SITE + path, { headers: cookie ? { cookie } : {} }));
const post = (path: string, cookie = '', origin = SITE) => handler(new Request(SITE + path, { method: 'POST', headers: { origin, cookie } }));
const cookies = (r: Response) => r.headers.getSetCookie();

/** Fakes Google's token and revoke endpoints. */
function google(reply: Record<string, unknown>, status = 200) {
  const calls: URLSearchParams[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(new URLSearchParams(init.body as URLSearchParams));
      return new Response(JSON.stringify(reply), { status });
    }),
  );
  return calls;
}

beforeEach(() => {
  vi.stubEnv('GOOGLE_CLIENT_ID', 'cid.apps.googleusercontent.com');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'shh');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('auth function', () => {
  it('reports whether it is configured', async () => {
    expect(await (await get('/api/auth/status')).json()).toEqual({ configured: true });
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '');
    expect(await (await get('/api/auth/status')).json()).toEqual({ configured: false });
    expect((await post('/api/auth/refresh')).status).toBe(501);
  });

  it('starts an offline consent with a state cookie', async () => {
    const r = await get('/api/auth/start');
    expect(r.status).toBe(302);
    const to = new URL(r.headers.get('location')!);
    expect(to.origin + to.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(to.searchParams.get('access_type')).toBe('offline');
    expect(to.searchParams.get('redirect_uri')).toBe(`${SITE}/api/auth/callback`);
    expect(cookies(r)[0]).toContain(`__Host-planner_state=${to.searchParams.get('state')};`);
  });

  it('turns down a callback whose state does not match', async () => {
    const calls = google({});
    const r = await get('/api/auth/callback?code=c&state=evil', '__Host-planner_state=good');
    expect(r.headers.get('location')).toBe('/?auth=state');
    expect(calls).toHaveLength(0);
  });

  it('keeps the refresh token in an httpOnly cookie after the callback', async () => {
    const calls = google({ access_token: 'at', refresh_token: 'rt-1', expires_in: 3599, scope: SCOPE });
    const r = await get('/api/auth/callback?code=c&state=s1', '__Host-planner_state=s1');
    expect(r.headers.get('location')).toBe('/');
    expect(calls[0]!.get('client_secret')).toBe('shh');
    expect(calls[0]!.get('redirect_uri')).toBe(`${SITE}/api/auth/callback`);
    const rt = cookies(r).find((c) => c.startsWith('__Host-planner_rt='))!;
    expect(rt).toMatch(/rt-1; Path=\/; Max-Age=\d+; HttpOnly; Secure; SameSite=Strict/);
  });

  it('refuses a sign-in without calendar access', async () => {
    google({ access_token: 'at', refresh_token: 'rt-1', scope: 'openid' });
    const r = await get('/api/auth/callback?code=c&state=s1', '__Host-planner_state=s1');
    expect(r.headers.get('location')).toBe('/?auth=scope');
    expect(cookies(r).some((c) => c.startsWith('__Host-planner_rt=rt'))).toBe(false);
  });

  it('hands out access tokens from the cookie', async () => {
    const calls = google({ access_token: 'fresh', expires_in: 3599 });
    const r = await post('/api/auth/refresh', '__Host-planner_rt=rt-1');
    expect(await r.json()).toEqual({ access_token: 'fresh', expires_in: 3599 });
    expect(calls[0]!.get('refresh_token')).toBe('rt-1');
  });

  it('signs out when Google revoked the grant, or there is no cookie', async () => {
    google({ error: 'invalid_grant' }, 400);
    const r = await post('/api/auth/refresh', '__Host-planner_rt=old');
    expect(r.status).toBe(401);
    expect(cookies(r)[0]).toContain('Max-Age=0');
    expect((await post('/api/auth/refresh')).status).toBe(401);
  });

  it('only answers the app itself', async () => {
    google({ access_token: 'fresh' });
    expect((await post('/api/auth/refresh', '__Host-planner_rt=rt-1', 'https://evil.example')).status).toBe(403);
  });

  it('revokes the token on sign-out', async () => {
    const calls = google({});
    const r = await post('/api/auth/logout', '__Host-planner_rt=rt-1');
    expect(r.status).toBe(204);
    expect(calls[0]!.get('token')).toBe('rt-1');
    expect(cookies(r)[0]).toContain('Max-Age=0');
  });
});
