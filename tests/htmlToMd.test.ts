import { describe, expect, it } from 'vitest';
import { htmlToMarkdown, looksLikeHtml, normalizeDescription } from '../src/domain/markdown/htmlToMd';

describe('looksLikeHtml', () => {
  it('detects Google editor HTML but not markdown with angle brackets', () => {
    expect(looksLikeHtml('a<br>b')).toBe(true);
    expect(looksLikeHtml('<ul><li>x</li></ul>')).toBe(true);
    expect(looksLikeHtml('press <tab> then a < b')).toBe(false);
    expect(looksLikeHtml('- [ ] plain')).toBe(false);
  });
});

describe('htmlToMarkdown', () => {
  it('converts breaks, lists and emphasis', () => {
    expect(htmlToMarkdown('Hello<br><b>bold</b> and <i>it</i><ul><li>one</li><li>two</li></ul>')).toBe(
      'Hello\n**bold** and *it*\n- one\n- two',
    );
  });

  it('keeps checklist lines that Google wrapped in <br>s', () => {
    expect(htmlToMarkdown('- [ ] a<br>- [x] b')).toBe('- [ ] a\n- [x] b');
  });

  it('converts ordered and nested lists', () => {
    expect(htmlToMarkdown('<ol><li>a<ul><li>b</li></ul></li><li>c</li></ol>')).toBe('1. a\n  - b\n2. c');
  });

  it('keeps safe links and drops unsafe ones', () => {
    expect(htmlToMarkdown('<a href="https://x.io">site</a>')).toBe('[site](https://x.io)');
    expect(htmlToMarkdown('<a href="https://x.io">https://x.io</a>')).toBe('https://x.io');
    expect(htmlToMarkdown('<a href="javascript:alert(1)">click</a>')).toBe('click');
  });

  it('drops scripts and styles and decodes entities', () => {
    expect(htmlToMarkdown('<p>a &amp; b &lt;c&gt;&nbsp;d</p><script>alert(1)</script><style>p{}</style>')).toBe('a & b <c> d');
  });

  it('never runs code from the HTML', () => {
    (window as unknown as { __pwned?: boolean }).__pwned = false;
    htmlToMarkdown('<img src=x onerror="window.__pwned=true"><p>ok</p>');
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBe(false);
  });

  it('converts paragraphs and headings', () => {
    expect(htmlToMarkdown('<h2>Title</h2><p>one</p><p>two</p>')).toBe('## Title\n\none\n\ntwo');
  });

  it('handles Japanese text', () => {
    expect(htmlToMarkdown('<b>会議</b><br>資料を準備')).toBe('**会議**\n資料を準備');
  });
});

describe('normalizeDescription', () => {
  it('passes plain markdown through untouched', () => {
    expect(normalizeDescription('## x\n\n- [ ] a < b')).toBe('## x\n\n- [ ] a < b');
    expect(normalizeDescription('plain **md**')).toBe('plain **md**');
    expect(normalizeDescription(undefined)).toBe('');
  });

  it('converts descriptions that contain editor HTML', () => {
    expect(normalizeDescription('- [ ] a <b>b</b>')).toBe('- [ ] a **b**');
  });
});
