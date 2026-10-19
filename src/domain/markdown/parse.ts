/**
 * A small markdown subset, parsed into a tree that the UI renders as React elements.
 * No HTML strings are produced, so there is nothing to sanitize.
 */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'strong' | 'em' | 'del'; c: Inline[] }
  | { t: 'link'; href: string; c: Inline[] };

export interface ListItem {
  /** Nesting level (2 spaces or half a tab per level). */
  indent: number;
  /** Present for checklist items; `line` is the source line index used for toggling. */
  task?: { done: boolean; line: number };
  content: Inline[];
}

export type Block =
  | { t: 'heading'; level: 3 | 4 | 5; c: Inline[] }
  | { t: 'para'; lines: Inline[][] }
  | { t: 'quote'; lines: Inline[][] }
  | { t: 'code'; v: string }
  | { t: 'hr' }
  | { t: 'list'; ordered: boolean; items: ListItem[] };

export const splitLines = (md: string) => md.replace(/\r\n?/g, '\n').split('\n');

export const FENCE = /^\s*```/;
export const TASK_LINE = /^(\s*)[-*+]\s+\[( |x|X)\](?:\s+(.*))?$/;
const BULLET_LINE = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED_LINE = /^(\s*)\d+[.)]\s+(.*)$/;
const HEADING_LINE = /^(#{1,6})\s+(.*)$/;
const HR_LINE = /^\s*([-*_])\1{2,}\s*$/;
const QUOTE_LINE = /^\s*>/;

const indentOf = (s: string) => Math.floor(s.replace(/\t/g, '    ').length / 2);

export function parseMarkdown(md: string): Block[] {
  const lines = splitLines(md);
  const out: Block[] = [];
  let list: Extract<Block, { t: 'list' }> | null = null;
  let para: string[] = [];

  const closeList = () => {
    list = null;
  };
  const flushPara = () => {
    if (para.length) out.push({ t: 'para', lines: para.map(parseInline) });
    para = [];
  };
  const listOf = (ordered: boolean) => {
    flushPara();
    if (!list || list.ordered !== ordered) {
      list = { t: 'list', ordered, items: [] };
      out.push(list);
    }
    return list;
  };

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]!;
    let m: RegExpMatchArray | null;
    if (FENCE.test(ln)) {
      flushPara();
      closeList();
      const code: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i]!)) code.push(lines[i++]!);
      out.push({ t: 'code', v: code.join('\n') });
      continue;
    }
    if (!ln.trim()) {
      flushPara();
      closeList();
      continue;
    }
    if ((m = ln.match(HEADING_LINE))) {
      flushPara();
      closeList();
      const level = Math.min(m[1]!.length + 2, 5) as 3 | 4 | 5;
      out.push({ t: 'heading', level, c: parseInline(m[2]!) });
      continue;
    }
    if (HR_LINE.test(ln)) {
      flushPara();
      closeList();
      out.push({ t: 'hr' });
      continue;
    }
    if (QUOTE_LINE.test(ln)) {
      flushPara();
      closeList();
      const q: string[] = [];
      while (i < lines.length && QUOTE_LINE.test(lines[i]!)) q.push(lines[i++]!.replace(/^\s*>\s?/, ''));
      i--;
      out.push({ t: 'quote', lines: q.map(parseInline) });
      continue;
    }
    if ((m = ln.match(TASK_LINE))) {
      listOf(false).items.push({
        indent: indentOf(m[1]!),
        task: { done: m[2] !== ' ', line: i },
        content: parseInline(m[3] ?? ''),
      });
      continue;
    }
    if ((m = ln.match(BULLET_LINE))) {
      listOf(false).items.push({ indent: indentOf(m[1]!), content: parseInline(m[2]!) });
      continue;
    }
    if ((m = ln.match(ORDERED_LINE))) {
      listOf(true).items.push({ indent: indentOf(m[1]!), content: parseInline(m[2]!) });
      continue;
    }
    closeList();
    para.push(ln.trim());
  }
  flushPara();
  return out;
}

const LINK = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/;
const AUTOLINK = /^https?:\/\/[^\s<)]+/;
const WORD = /\w/;

/** Parses inline markdown: `code`, [links](https://…), bare URLs, **bold**, *em*, _em_, ~~del~~. */
export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const push = (n: Inline) => {
    if (text) out.push({ t: 'text', v: text });
    text = '';
    out.push(n);
  };

  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    const prev = i > 0 ? s[i - 1]! : '';
    const rest = s.slice(i);
    let m: RegExpMatchArray | null;

    if (ch === '`') {
      const j = s.indexOf('`', i + 1);
      if (j > i + 1) {
        push({ t: 'code', v: s.slice(i + 1, j) });
        i = j + 1;
        continue;
      }
    }
    if (ch === '[' && (m = rest.match(LINK))) {
      push({ t: 'link', href: m[2]!, c: parseInline(m[1]!) });
      i += m[0].length;
      continue;
    }
    if (ch === 'h' && (prev === '' || /[\s(]/.test(prev)) && (m = rest.match(AUTOLINK))) {
      push({ t: 'link', href: m[0], c: [{ t: 'text', v: m[0] }] });
      i += m[0].length;
      continue;
    }
    if ((ch === '*' && s[i + 1] === '*') || (ch === '~' && s[i + 1] === '~')) {
      const mark = ch + ch;
      const j = s.indexOf(mark, i + 3);
      if (j > 0) {
        push({ t: ch === '*' ? 'strong' : 'del', c: parseInline(s.slice(i + 2, j)) });
        i = j + 2;
        continue;
      }
    }
    if (ch === '*' && s[i + 1] !== '*' && (prev === '' || (prev !== '*' && !WORD.test(prev)))) {
      const j = s.indexOf('*', i + 1);
      if (j > i + 1 && !/\s/.test(s[i + 1]!) && s[j + 1] !== '*') {
        push({ t: 'em', c: parseInline(s.slice(i + 1, j)) });
        i = j + 1;
        continue;
      }
    }
    if (ch === '_' && (prev === '' || !/[\w_]/.test(prev))) {
      const j = s.indexOf('_', i + 1);
      if (j > i + 1 && !/\s/.test(s[i + 1]!) && !/[\w_]/.test(s[j + 1] ?? '')) {
        push({ t: 'em', c: parseInline(s.slice(i + 1, j)) });
        i = j + 1;
        continue;
      }
    }
    text += ch;
    i++;
  }
  if (text) out.push({ t: 'text', v: text });
  return out;
}

/** Plain text of an inline tree, for previews and accessible names. */
export const inlineText = (nodes: Inline[]): string =>
  nodes.map((n) => (n.t === 'text' || n.t === 'code' ? n.v : inlineText(n.c))).join('');
