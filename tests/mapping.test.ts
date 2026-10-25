import { describe, expect, it } from 'vitest';
import { fromGoogle, isUsable, patchBody, toGoogle, type GEvent } from '../src/data/google/mapping';
import type { Task } from '../src/domain/types';

const timed: GEvent = {
  id: 'e1',
  etag: '"1"',
  summary: 'Review',
  description: '- [ ] a',
  colorId: '3',
  start: { dateTime: '2026-10-19T09:00:00+09:00' },
  end: { dateTime: '2026-10-19T10:30:00+09:00' },
  extendedProperties: { private: { done: '1', other: 'keep' } },
};

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

describe('fromGoogle', () => {
  it('maps a timed event', () => {
    const t = fromGoogle(timed);
    expect(t).toMatchObject({ id: 'e1', etag: '"1"', title: 'Review', colorId: '3', done: true, allDay: false, extraProps: { other: 'keep' } });
    expect(t.start.toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(t.end.getTime() - t.start.getTime()).toBe(90 * 60000);
  });

  it('maps an all-day event to local midnights with an exclusive end', () => {
    const t = fromGoogle({ id: 'a', start: { date: '2026-10-23' }, end: { date: '2026-10-24' } });
    expect(t.allDay).toBe(true);
    expect(t.start).toEqual(new Date(2026, 9, 23));
    expect(t.end).toEqual(new Date(2026, 9, 24));
  });

  it('fills defaults and converts HTML descriptions', () => {
    const t = fromGoogle({ id: 'x', start: { date: '2026-10-23' }, end: { date: '2026-10-24' }, description: 'a<br>b' });
    expect(t).toMatchObject({ title: '(untitled)', colorId: '9', done: false, description: 'a\nb' });
    expect(t.extraProps).toBeUndefined();
  });

  it('filters cancelled events', () => {
    expect(isUsable({ ...timed, status: 'cancelled' })).toBe(false);
    expect(isUsable(timed)).toBe(true);
  });
});

describe('labels', () => {
  it('reads a known label and ignores anything else', () => {
    expect(fromGoogle({ ...timed, extendedProperties: { private: { label: 'personal' } } }).label).toBe('personal');
    const odd = fromGoogle({ ...timed, extendedProperties: { private: { label: 'hobby' } } });
    expect(odd.label).toBeUndefined();
    expect(odd.extraProps).toBeUndefined();
  });
});

describe('toGoogle', () => {
  it('builds a full body and keeps foreign private props', () => {
    const t = fromGoogle(timed);
    expect(toGoogle(t)).toEqual({
      summary: 'Review',
      description: '- [ ] a',
      colorId: '3',
      start: { dateTime: '2026-10-19T00:00:00.000Z', timeZone: TZ },
      end: { dateTime: '2026-10-19T01:30:00.000Z', timeZone: TZ },
      extendedProperties: { private: { other: 'keep', done: '1', label: '', tags: '' } },
    });
  });

  it('uses date fields for all-day tasks', () => {
    const b = toGoogle({ title: 'x', description: '', colorId: '9', done: false, allDay: true, start: new Date(2026, 9, 23), end: new Date(2026, 9, 25) });
    expect(b.start).toEqual({ date: '2026-10-23' });
    expect(b.end).toEqual({ date: '2026-10-25' });
  });
});

describe('patchBody', () => {
  const base: Task = fromGoogle(timed);

  it('sends only what changed', () => {
    expect(patchBody(base, { ...base, title: 'New' })).toEqual({ summary: 'New' });
    expect(patchBody(base, { ...base })).toEqual({});
  });

  it('does not resend an unchanged (possibly HTML-origin) description', () => {
    expect(patchBody(base, { ...base, done: false })).toEqual({ extendedProperties: { private: { other: 'keep', done: '0', label: '', tags: '' } } });
  });

  it('stores tags comma-separated and sends tag changes', () => {
    const tagged = { ...base, tags: ['urgent', '報告'] };
    expect(patchBody(base, tagged)).toEqual({ extendedProperties: { private: { other: 'keep', done: '1', label: '', tags: 'urgent,報告' } } });
    expect(fromGoogle({ ...timed, extendedProperties: { private: { tags: 'urgent,報告' } } }).tags).toEqual(['urgent', '報告']);
  });

  it('sends label changes and clears a removed label', () => {
    const work = { ...base, label: 'work' as const };
    expect(patchBody(base, work)).toEqual({ extendedProperties: { private: { other: 'keep', done: '1', label: 'work', tags: '' } } });
    expect(patchBody(work, base)).toEqual({ extendedProperties: { private: { other: 'keep', done: '1', label: '', tags: '' } } });
  });

  it('sends both times when either changes, keeping multi-day lengths', () => {
    const next = { ...base, end: new Date('2026-10-21T01:30:00Z') };
    expect(patchBody(base, next)).toEqual({
      start: { dateTime: '2026-10-19T00:00:00.000Z', timeZone: TZ },
      end: { dateTime: '2026-10-21T01:30:00.000Z', timeZone: TZ },
    });
  });

  it('clears the other time field when switching to all-day', () => {
    const next = { ...base, allDay: true, start: new Date(2026, 9, 19), end: new Date(2026, 9, 20) };
    expect(patchBody(base, next)).toEqual({
      start: { date: '2026-10-19', dateTime: null },
      end: { date: '2026-10-20', dateTime: null },
    });
  });
});

describe('repeating events', () => {
  it('reads a series and its occurrences', () => {
    const series = fromGoogle({ ...timed, recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'] });
    expect(series.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO']);
    const one = fromGoogle({ ...timed, id: 'e1_20261019T000000Z', recurringEventId: 'e1', originalStartTime: { dateTime: '2026-10-19T09:00:00+09:00' } });
    expect(one.seriesId).toBe('e1');
    expect(one.originalStart?.toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(one.recurrence).toBeUndefined();
  });

  it('creates a series with its rule and a time zone', () => {
    const b = toGoogle({ ...fromGoogle(timed), recurrence: ['RRULE:FREQ=DAILY'] });
    expect(b.recurrence).toEqual(['RRULE:FREQ=DAILY']);
    expect(b.start).toEqual({ dateTime: '2026-10-19T00:00:00.000Z', timeZone: TZ });
  });

  it('sends a changed rule, and nothing for an unchanged one', () => {
    const base = fromGoogle({ ...timed, recurrence: ['RRULE:FREQ=DAILY'] });
    expect(patchBody(base, { ...base, recurrence: ['RRULE:FREQ=WEEKLY'] })).toEqual({ recurrence: ['RRULE:FREQ=WEEKLY'] });
    expect(patchBody(base, { ...base })).toEqual({});
  });
});
