import { useSyncExternalStore } from 'react';
import { loadLang, saveLang } from '../state/settings';
import { en, type Messages, type MsgKey } from './en';
import { ja } from './ja';
import { mn } from './mn';

export type { MsgKey };
export const LANGS = { en: 'English', mn: 'Монгол', ja: '日本語' } as const;
export type Lang = keyof typeof LANGS;

const MESSAGES: Record<Lang, Messages> = { en, mn, ja };

let lang: Lang = loadLang(Object.keys(LANGS) as Lang[]);
const listeners = new Set<() => void>();

export const getLang = () => lang;
export function setLang(next: Lang) {
  lang = next;
  saveLang(next);
  listeners.forEach((l) => l());
}
/** Re-renders the caller when the language changes. */
export const useLang = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getLang,
  );

/** The message for `key` in the current language, with `{name}` placeholders filled from `vars`. */
export function t(key: MsgKey, vars?: Record<string, string | number>): string {
  const msg = MESSAGES[lang][key];
  return vars ? msg.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : msg;
}

/** A length of time: "45m", "2h", "1h 30m" (in the current language). */
export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h && m ? t('dur.hm', { h, m }) : h ? t('dur.h', { h }) : t('dur.m', { m });
}

/** Formats a date in the current language. */
export const fmtDate = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  lang === 'mn' ? mnDate(d, opts) : d.toLocaleDateString(lang, opts);

/** Formats a date range in the current language, collapsing shared parts ("October 2026"). */
export function fmtRange(a: Date, b: Date, opts: Intl.DateTimeFormatOptions): string {
  if (lang === 'ja' && opts.day) return jaRange(a, b, !!opts.year);
  if (lang !== 'mn') return new Intl.DateTimeFormat(lang, opts).formatRange(a, b);
  if (a.getFullYear() !== b.getFullYear()) return `${mnDate(a, opts)} – ${mnDate(b, opts)}`;
  const { year: _, ...rest } = opts;
  const head = mnDate(a, opts);
  if (a.getMonth() !== b.getMonth()) return `${head} – ${mnDate(b, rest)}`;
  return opts.day && a.getDate() !== b.getDate() ? `${mnDate(a, { ...opts, weekday: undefined })}–${b.getDate()}` : head;
}

/** "2026年10月21日～23日": ICU falls back to "2026/10/21～2026/10/23" for Japanese ranges with a long month. */
function jaRange(a: Date, b: Date, withYear: boolean): string {
  const y = (d: Date) => (withYear ? `${d.getFullYear()}年` : '');
  const md = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`;
  if (a.getFullYear() !== b.getFullYear()) return `${y(a)}${md(a)}～${y(b)}${md(b)}`;
  if (a.getMonth() !== b.getMonth()) return `${y(a)}${md(a)}～${md(b)}`;
  return a.getDate() === b.getDate() ? `${y(a)}${md(a)}` : `${y(a)}${md(a)}～${b.getDate()}日`;
}

const MN_WEEKDAYS = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];

/**
 * Mongolian dates ("2026 оны 10-р сарын 21, Мягмар"), built by hand because browsers
 * often ship without Mongolian date data and fall back to English.
 */
export function mnDate(d: Date, o: Intl.DateTimeFormatOptions): string {
  const wd = MN_WEEKDAYS[d.getDay()]!;
  const parts: string[] = [];
  if (o.year) parts.push(`${d.getFullYear()} оны`);
  if (o.month) parts.push(`${d.getMonth() + 1}-р сар${o.day ? 'ын' : ''}`);
  if (o.day) parts.push(String(d.getDate()));
  const date = parts.join(' ');
  if (!o.weekday) return date;
  const w = o.weekday === 'long' ? wd : wd.slice(0, 2);
  return date ? `${date}, ${w}` : w;
}
