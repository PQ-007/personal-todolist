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
