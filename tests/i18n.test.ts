import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { ja } from '../src/i18n/ja';
import { mn } from '../src/i18n/mn';

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('translations', () => {
  for (const [name, msgs] of Object.entries({ mn, ja })) {
    it(`${name} uses the same placeholders as English`, () => {
      for (const [key, src] of Object.entries(en)) {
        expect(vars(msgs[key as keyof typeof en]), key).toEqual(vars(src));
      }
    });
  }
});

describe('mnDate', () => {
  it('formats Mongolian dates without relying on browser locale data', async () => {
    const { mnDate } = await import('../src/i18n');
    const d = new Date(2026, 9, 20);
    expect(mnDate(d, { year: 'numeric', month: 'long', day: 'numeric' })).toBe('2026 оны 10-р сарын 20');
    expect(mnDate(d, { month: 'long', day: 'numeric', weekday: 'short' })).toBe('10-р сарын 20, Мя');
    expect(mnDate(d, { weekday: 'long' })).toBe('Мягмар');
    expect(mnDate(d, { year: 'numeric', month: 'long' })).toBe('2026 оны 10-р сар');
  });
});

describe('fmtRange in Mongolian', () => {
  it('shortens ranges inside one month', async () => {
    const { fmtRange, setLang } = await import('../src/i18n');
    setLang('mn');
    const opts = { year: 'numeric', month: 'long', day: 'numeric' } as const;
    expect(fmtRange(new Date(2026, 9, 19), new Date(2026, 9, 23), opts)).toBe('2026 оны 10-р сарын 19–23');
    expect(fmtRange(new Date(2026, 9, 26), new Date(2026, 10, 1), opts)).toBe('2026 оны 10-р сарын 26 – 11-р сарын 1');
    setLang('en');
  });
});

describe('fmtRange in Japanese', () => {
  it('writes ranges the way Japanese calendars do', async () => {
    const { fmtRange, setLang } = await import('../src/i18n');
    setLang('ja');
    const opts = { year: 'numeric', month: 'long', day: 'numeric' } as const;
    expect(fmtRange(new Date(2026, 9, 21), new Date(2026, 9, 23), opts)).toBe('2026年10月21日～23日');
    expect(fmtRange(new Date(2026, 9, 26), new Date(2026, 10, 1), opts)).toBe('2026年10月26日～11月1日');
    expect(fmtRange(new Date(2026, 11, 28), new Date(2027, 0, 3), opts)).toBe('2026年12月28日～2027年1月3日');
    setLang('en');
  });
});
