import { Fragment, type ReactNode } from 'react';
import type { Inline } from '../domain/markdown/parse';
import { parseMarkdown } from '../domain/markdown/parse';

/** Renders markdown as React elements. Text is never interpreted as HTML. */
export function MarkdownView({ source, onToggle }: { source: string; onToggle?: (line: number) => void }) {
  const blocks = parseMarkdown(source);
  return (
    <div className="md">
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'heading': {
            const H = `h${b.level}` as const;
            return <H key={i}>{inline(b.c)}</H>;
          }
          case 'para':
            return <p key={i}>{lines(b.lines)}</p>;
          case 'quote':
            return <blockquote key={i}>{lines(b.lines)}</blockquote>;
          case 'code':
            return (
              <pre key={i}>
                <code>{b.v}</code>
              </pre>
            );
          case 'hr':
            return <hr key={i} />;
          case 'list': {
            const L = b.ordered ? 'ol' : 'ul';
            return (
              <L key={i}>
                {b.items.map((it, j) =>
                  it.task ? (
                    <li
                      key={j}
                      className={'task' + (it.task.done ? ' done' : '')}
                      style={{ marginLeft: `${it.indent * 1.1 - 1.25}em` }}
                    >
                      <label>
                        <input
                          type="checkbox"
                          checked={it.task.done}
                          disabled={!onToggle}
                          onChange={() => onToggle?.(it.task!.line)}
                        />
                        <span>{inline(it.content)}</span>
                      </label>
                    </li>
                  ) : (
                    <li key={j} style={{ marginLeft: `${it.indent * 1.1}em` }}>
                      {inline(it.content)}
                    </li>
                  ),
                )}
              </L>
            );
          }
        }
      })}
    </div>
  );
}

const lines = (ls: Inline[][]) =>
  ls.map((l, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {inline(l)}
    </Fragment>
  ));

function inline(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text':
        return <Fragment key={i}>{n.v}</Fragment>;
      case 'code':
        return <code key={i}>{n.v}</code>;
      case 'strong':
        return <strong key={i}>{inline(n.c)}</strong>;
      case 'em':
        return <em key={i}>{inline(n.c)}</em>;
      case 'del':
        return <del key={i}>{inline(n.c)}</del>;
      case 'link':
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">
            {inline(n.c)}
          </a>
        );
    }
  });
}
