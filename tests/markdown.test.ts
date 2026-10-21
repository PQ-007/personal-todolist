import { describe, expect, it } from 'vitest';
import { inlineText, parseInline, parseMarkdown, type Block } from '../src/domain/markdown/parse';
import { countTasks, toggleTaskLine } from '../src/domain/markdown/tasks';

describe('parseInline', () => {
  it('parses bold, em, del and code', () => {
    expect(parseInline('a **b** *c* _d_ ~~e~~ `f`')).toEqual([
      { t: 'text', v: 'a ' },
      { t: 'strong', c: [{ t: 'text', v: 'b' }] },
      { t: 'text', v: ' ' },
      { t: 'em', c: [{ t: 'text', v: 'c' }] },
      { t: 'text', v: ' ' },
      { t: 'em', c: [{ t: 'text', v: 'd' }] },
      { t: 'text', v: ' ' },
      { t: 'del', c: [{ t: 'text', v: 'e' }] },
      { t: 'text', v: ' ' },
      { t: 'code', v: 'f' },
    ]);
  });

  it('keeps markdown inside code literal', () => {
    expect(parseInline('`**x**`')).toEqual([{ t: 'code', v: '**x**' }]);
  });

  it('only links http(s) and mailto', () => {
    expect(parseInline('[a](https://x.io/p)')).toEqual([{ t: 'link', href: 'https://x.io/p', c: [{ t: 'text', v: 'a' }] }]);
    expect(parseInline('[a](javascript:alert(1))')).toEqual([{ t: 'text', v: '[a](javascript:alert(1))' }]);
    expect(parseInline('[m](mailto:a@b.c)')[0]).toMatchObject({ t: 'link', href: 'mailto:a@b.c' });
  });

  it('autolinks bare URLs after whitespace or start', () => {
    const n = parseInline('Notes: https://example.com/rpa-notes');
    expect(n[1]).toEqual({ t: 'link', href: 'https://example.com/rpa-notes', c: [{ t: 'text', v: 'https://example.com/rpa-notes' }] });
    expect(parseInline('xhttps://a.b').every((x) => x.t === 'text')).toBe(true);
  });

  it('treats HTML as plain text', () => {
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([{ t: 'text', v: '<img src=x onerror=alert(1)>' }]);
  });

  it('does not italicise snake_case or a*b*c', () => {
    expect(inlineText(parseInline('daily_update_file'))).toBe('daily_update_file');
    expect(parseInline('daily_update_file')).toHaveLength(1);
    expect(parseInline('a*b*c')).toHaveLength(1);
  });

  it('does not italicise underscores inside Japanese or mixed-script words', () => {
    const s = '（株）資生堂_Google/Yahooの管理画面RAW取得_日次レポート';
    expect(parseInline(s)).toEqual([{ t: 'text', v: s }]);
    const id = 'クレーネル_ 261001_クレーネル_50ウマ娘 / 52_FGO_玉兎_後期_X日次';
    expect(parseInline(id)).toEqual([{ t: 'text', v: id }]);
    expect(parseInline('今日は _大事_ な日')).toEqual([
      { t: 'text', v: '今日は ' },
      { t: 'em', c: [{ t: 'text', v: '大事' }] },
      { t: 'text', v: ' な日' },
    ]);
  });

  it('handles Japanese text', () => {
    expect(parseInline('**重要** 今日のタスク')).toEqual([
      { t: 'strong', c: [{ t: 'text', v: '重要' }] },
      { t: 'text', v: ' 今日のタスク' },
    ]);
  });

  it('leaves unclosed markers alone', () => {
    expect(inlineText(parseInline('**open and `tick'))).toBe('**open and `tick');
  });
});

describe('parseMarkdown', () => {
  it('parses blocks like the prototype', () => {
    const md = '## Head\n\npara 1\npara 2\n\n- [x] done\n- [ ] todo\n  - nested\n\n1. one\n2. two\n\n> quote\n\n---\n\n```\n- [ ] not a task\n```';
    const b = parseMarkdown(md);
    expect(b.map((x) => x.t)).toEqual(['heading', 'para', 'list', 'list', 'quote', 'hr', 'code']);
    expect(b[0]).toMatchObject({ t: 'heading', level: 4 });
    expect((b[1] as Extract<Block, { t: 'para' }>).lines).toHaveLength(2);
    const list = b[2] as Extract<Block, { t: 'list' }>;
    expect(list.items.map((i) => i.task)).toEqual([{ done: true, line: 5 }, { done: false, line: 6 }, undefined]);
    expect(list.items[2]!.indent).toBe(1);
    expect(b[3]).toMatchObject({ t: 'list', ordered: true });
    expect(b[6]).toEqual({ t: 'code', v: '- [ ] not a task' });
  });

  it('maps # to h3 and caps at h5', () => {
    expect(parseMarkdown('# a\n### b\n###### c').map((b) => (b.t === 'heading' ? b.level : 0))).toEqual([3, 5, 5]);
  });

  it('uses line indices that match CRLF input', () => {
    const b = parseMarkdown('x\r\n\r\n- [ ] a');
    expect((b[1] as Extract<Block, { t: 'list' }>).items[0]!.task!.line).toBe(2);
  });

  it('accepts an empty checklist item', () => {
    const list = parseMarkdown('- [ ]')[0] as Extract<Block, { t: 'list' }>;
    expect(list.items[0]).toMatchObject({ task: { done: false, line: 0 }, content: [] });
  });
});

describe('toggleTaskLine', () => {
  it('flips only the given line', () => {
    const md = '- [ ] a\n- [x] b\n* [X] c';
    expect(toggleTaskLine(md, 0)).toBe('- [x] a\n- [x] b\n* [X] c');
    expect(toggleTaskLine(md, 1)).toBe('- [ ] a\n- [ ] b\n* [X] c');
    expect(toggleTaskLine(md, 2)).toBe('- [ ] a\n- [x] b\n* [ ] c');
  });

  it('ignores lines that are not checklist items and out-of-range indices', () => {
    expect(toggleTaskLine('text [ ]', 0)).toBe('text [ ]');
    expect(toggleTaskLine('- [ ] a', 5)).toBe('- [ ] a');
  });

  it('round-trips with parse line indices', () => {
    const md = '## T\n\n  - [ ] indented\n- [ ] 二つ目';
    const list = parseMarkdown(md)[1] as Extract<Block, { t: 'list' }>;
    let out = md;
    for (const it of list.items) out = toggleTaskLine(out, it.task!.line);
    expect(countTasks(out)).toEqual({ t: 2, d: 2 });
  });
});

describe('countTasks', () => {
  it('counts total and done', () => {
    expect(countTasks('- [x] a\n- [ ] b\n+ [X] c\ntext')).toEqual({ t: 3, d: 2 });
    expect(countTasks('')).toEqual({ t: 0, d: 0 });
  });
  it('skips code fences', () => {
    expect(countTasks('```\n- [ ] x\n```\n- [ ] y')).toEqual({ t: 1, d: 0 });
  });
});
