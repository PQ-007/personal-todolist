import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGoogleStore } from '../src/data/google/googleStore';
import { fromGoogle, occurrenceProps, type GEvent } from '../src/data/google/mapping';
import { applyChecklistState, checklistState } from '../src/domain/markdown/tasks';

const NOTES = '## Reports\n- [ ] A\n- [ ] B\n```\n- [ ] not a task\n```\n- [ ] C';

/** One occurrence of a daily series, as Google lists it (with the series' private properties). */
const occurrence = (priv: Record<string, string> = {}, day = '20261025'): GEvent => ({
  id: `wake_${day}T210000Z`,
  etag: '"7"',
  summary: 'Reports',
  description: NOTES,
  recurringEventId: 'wake',
  originalStartTime: { dateTime: '2026-10-25T05:00:00+08:00' },
  start: { dateTime: '2026-10-25T05:00:00+08:00' },
  end: { dateTime: '2026-10-25T06:00:00+08:00' },
  extendedProperties: { private: { done: '1', label: 'work', ...priv } },
});

describe('checklist state', () => {
  it('reads and applies ticks outside code fences', () => {
    const ticked = NOTES.replace('- [ ] B', '- [x] B');
    expect(checklistState(ticked)).toBe('010');
    expect(applyChecklistState(NOTES, '101')).toBe(NOTES.replace('- [ ] A', '- [x] A').replace('- [ ] C', '- [x] C'));
    // A shorter state leaves the remaining items alone.
    expect(applyChecklistState(ticked, '1')).toBe(ticked.replace('- [ ] A', '- [x] A'));
  });
});

describe('occurrences of a repeating task', () => {
  it("ignore the series' own done flag and read their own state", () => {
    const plain = fromGoogle(occurrence());
    expect(plain.done).toBe(false);
    expect(plain.label).toBe('work');

    const t = fromGoogle(occurrence({ d_20261025T210000Z: '1', c_20261025T210000Z: '010', d_20261024T210000Z: '1' }));
    expect(t.done).toBe(true);
    expect(checklistState(t.description)).toBe('010');
    expect(t.occurrenceKeys).toEqual(['d_20261025T210000Z', 'c_20261025T210000Z', 'd_20261024T210000Z']);
    expect(t.extraProps).toBeUndefined();

    // The next day has no state of its own yet.
    expect(fromGoogle(occurrence({ d_20261025T210000Z: '1' }, '20261026')).done).toBe(false);
  });

  it('save done and ticks on the series, keyed by occurrence', () => {
    const prev = fromGoogle(occurrence());
    const ticked = { ...prev, description: prev.description.replace('- [ ] A', '- [x] A') };
    expect(occurrenceProps(prev, ticked)).toEqual({ props: { c_20261025T210000Z: '100' }, rest: prev });
    expect(occurrenceProps(prev, { ...prev, done: true })).toEqual({ props: { d_20261025T210000Z: '1' }, rest: prev });
    expect(occurrenceProps(prev, { ...prev, title: 'Renamed' })).toBeNull();
  });

  it('move ticks into the notes when the notes themselves change, and drop old state', () => {
    const prev = fromGoogle(occurrence({ c_20261025T210000Z: '100', d_20260701T210000Z: '1' }));
    const edited = { ...prev, description: prev.description + '\n- [ ] D' };
    const own = occurrenceProps(prev, edited, new Date('2026-10-25T12:00:00Z'))!;
    expect(own.props).toEqual({ c_20261025T210000Z: null, d_20260701T210000Z: null });
    expect(own.rest.description).toContain('- [x] A');
  });
});

describe('Google store', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('ticks an occurrence on its series without touching the occurrence', async () => {
    const calls: { url: string; method: string; headers: Headers; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, method: init.method ?? 'GET', headers: new Headers(init.headers), body: init.body ? JSON.parse(init.body as string) : null });
        return new Response(JSON.stringify(occurrence()), { status: 200 });
      }),
    );
    const store = createGoogleStore({ calendarId: 'primary', getToken: async () => 'tok' });
    const prev = fromGoogle(occurrence());

    const saved = await store.update(prev, { ...prev, done: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toMatch(/\/events\/wake$/);
    expect(calls[0]!.body).toEqual({ extendedProperties: { private: { d_20261025T210000Z: '1' } } });
    expect(saved.done).toBe(true);
    expect(saved.occurrenceKeys).toEqual(['d_20261025T210000Z']);

    // Renaming one occurrence still saves on the occurrence, without an etag check.
    calls.length = 0;
    await store.update(prev, { ...prev, title: 'Reports (late)' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toMatch(/\/events\/wake_20261025T210000Z$/);
    expect(calls[0]!.headers.has('If-Match')).toBe(false);
  });
});
