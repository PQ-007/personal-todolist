import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Routes = Record<string, () => Response>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A fresh copy of the auth module (it keeps state) talking to a fake server. */
async function setup(routes: Routes) {
  const hits: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      hits.push(url);
      return routes[url]?.() ?? new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } });
    }),
  );
  vi.resetModules();
  return { auth: await import('../src/data/google/auth'), hits };
}

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('auth session', () => {
  it('renews the access token through the auth function', async () => {
    const { auth, hits } = await setup({
      '/api/auth/status': () => json({ configured: true }),
      '/api/auth/refresh': () => json({ access_token: 'fresh', expires_in: 3599 }),
    });
    expect(await auth.getToken()).toBe('fresh');
    // Cached until it expires: no second refresh.
    expect(await auth.getToken()).toBe('fresh');
    expect(hits.filter((h) => h.endsWith('/refresh'))).toHaveLength(1);
  });

  it('asks only once while signed out', async () => {
    const { auth, hits } = await setup({
      '/api/auth/status': () => json({ configured: true }),
      '/api/auth/refresh': () => json({ error: 'signed_out' }, 401),
    });
    expect(await auth.ensureToken()).toBe(false);
    expect(await auth.ensureToken()).toBe(false);
    expect(hits.filter((h) => h.endsWith('/refresh'))).toHaveLength(1);
    await expect(auth.getToken()).rejects.toThrow();
  });

  it('falls back to the token flow without the auth function', async () => {
    // The Vite dev server answers /api/* with the app's HTML.
    const { auth, hits } = await setup({});
    expect(await auth.ensureToken()).toBe(false);
    expect(hits).toEqual(['/api/auth/status']);
  });

  it('keeps a token across reloads in the same tab', async () => {
    sessionStorage.setItem('planner_tok', JSON.stringify({ tok: 'kept', exp: Date.now() + 600_000 }));
    const { auth, hits } = await setup({});
    auth.restoreToken();
    expect(await auth.getToken()).toBe('kept');
    expect(hits).toHaveLength(0);
  });
});
