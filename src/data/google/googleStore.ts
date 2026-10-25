import type { NewTask, Task } from '../../domain/types';
import { t } from '../../i18n';
import { AuthError, ConflictError, type TaskStore } from '../store';
import { fromGoogle, isUsable, patchBody, toGoogle, type GEvent } from './mapping';

const BASE = 'https://www.googleapis.com/calendar/v3';

export interface GoogleStoreOptions {
  calendarId: string;
  getToken: () => Promise<string>;
  /** Called when Google rejects the token, so the caller can drop it. */
  onUnauthorized?: () => void;
}

export function createGoogleStore(opts: GoogleStoreOptions): TaskStore {
  const cal = () => encodeURIComponent(opts.calendarId || 'primary');

  async function api<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${await opts.getToken()}`);
    if (init.body) headers.set('Content-Type', 'application/json');
    const r = await fetch(BASE + path, { ...init, headers });
    if (r.status === 401) {
      opts.onUnauthorized?.();
      // Revoked or expired early: try once more with a renewed token (when one can be had).
      if (!retried) return api<T>(path, init, true);
      throw new AuthError();
    }
    if (r.status === 412) throw new ConflictError();
    if (r.status === 204) return null as T;
    const j = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!r.ok) throw new Error(j?.error?.message || t('err.google', { status: r.status }));
    return j as T;
  }

  const eventPath = (id: string) => `/calendars/${cal()}/events/${encodeURIComponent(id)}`;

  return {
    kind: 'google',
    async list(from, to) {
      const out: Task[] = [];
      let pageToken: string | undefined;
      do {
        const q = new URLSearchParams({
          timeMin: from.toISOString(),
          timeMax: to.toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '250',
        });
        if (pageToken) q.set('pageToken', pageToken);
        const j = await api<{ items?: GEvent[]; nextPageToken?: string }>(`/calendars/${cal()}/events?${q}`);
        for (const g of j.items ?? []) if (isUsable(g)) out.push(fromGoogle(g));
        pageToken = j.nextPageToken;
      } while (pageToken);
      return out;
    },
    async create(t: NewTask) {
      return fromGoogle(await api<GEvent>(`/calendars/${cal()}/events`, { method: 'POST', body: JSON.stringify(toGoogle(t)) }));
    },
    async update(prev, next) {
      const body = patchBody(prev, next);
      const headers: HeadersInit = prev.etag ? { 'If-Match': prev.etag } : {};
      return fromGoogle(await api<GEvent>(eventPath(prev.id), { method: 'PATCH', headers, body: JSON.stringify(body) }));
    },
    async remove(id) {
      await api<null>(eventPath(id), { method: 'DELETE' });
    },
    async getSeries(id) {
      return fromGoogle(await api<GEvent>(eventPath(id)));
    },
  };
}
