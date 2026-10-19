/**
 * Google Calendar's own editor saves descriptions as HTML. This converts that HTML back to
 * our markdown. The HTML is parsed into an inert document (scripts never run, nothing is
 * attached to the page) and only text, structure and http(s)/mailto links are kept.
 */

const HTML_TAG =
  /<\/?(br|p|div|span|b|strong|i|em|u|s|del|strike|a|ul|ol|li|h[1-6]|code|pre|blockquote|font|html|body)\b[^>]*>/i;

/** True when a description looks like Google-generated HTML rather than plain markdown. */
export const looksLikeHtml = (s: string) => HTML_TAG.test(s);

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'NOSCRIPT', 'HEAD', 'TITLE']);
const BLOCK = new Set(['P', 'DIV', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL']);
const SAFE_HREF = /^(https?:|mailto:)/i;

export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const walk = (node: Node, depth: number): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\u00a0/g, ' ');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as Element;
    const tag = el.tagName;
    if (SKIP.has(tag)) return '';
    const kids = (d = depth) => Array.from(el.childNodes, (c) => walk(c, d)).join('');

    switch (tag) {
      case 'BR':
        return '\n';
      case 'B':
      case 'STRONG':
        return wrap(kids(), '**');
      case 'I':
      case 'EM':
        return wrap(kids(), '*');
      case 'S':
      case 'DEL':
      case 'STRIKE':
        return wrap(kids(), '~~');
      case 'CODE':
        return el.parentElement?.tagName === 'PRE' ? kids() : wrap(kids(), '`');
      case 'PRE':
        return `\n\`\`\`\n${el.textContent ?? ''}\n\`\`\`\n`;
      case 'A': {
        const href = el.getAttribute('href')?.trim() ?? '';
        const text = kids();
        if (!SAFE_HREF.test(href)) return text;
        return !text.trim() || text.trim() === href ? href : `[${text.trim()}](${href})`;
      }
      case 'UL':
      case 'OL': {
        const items = Array.from(el.children).filter((c) => c.tagName === 'LI');
        const lines = items.map((li, n) => {
          const mark = tag === 'OL' ? `${n + 1}.` : '-';
          const body = Array.from(li.childNodes, (c) => walk(c, depth + 1))
            .join('')
            .replace(/^\n+|\n+$/g, '');
          return `${'  '.repeat(depth)}${mark} ${body}`;
        });
        return `\n${lines.join('\n')}\n`;
      }
      case 'H1':
      case 'H2':
      case 'H3':
      case 'H4':
      case 'H5':
      case 'H6':
        return `\n${'#'.repeat(Number(tag[1]))} ${kids().trim()}\n`;
    }
    if (tag === 'BLOCKQUOTE') {
      return `\n${kids()
        .trim()
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n')}\n`;
    }
    return BLOCK.has(tag) ? `\n${kids()}\n` : kids();
  };

  return walk(doc.body, 0)
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function wrap(s: string, mark: string) {
  const inner = s.trim();
  if (!inner) return s;
  const lead = s.match(/^\s*/)![0];
  const trail = s.match(/\s*$/)![0];
  return `${lead}${mark}${inner}${mark}${trail}`;
}

/** Description as markdown: HTML from Google's editor is converted, plain text passes through. */
export const normalizeDescription = (s: string | undefined | null) => {
  if (!s) return '';
  return looksLikeHtml(s) ? htmlToMarkdown(s) : s;
};
