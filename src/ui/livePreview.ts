import { syntaxTree } from '@codemirror/language';
import type { Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';

/**
 * Obsidian-style live preview for CodeMirror: markdown is shown formatted while you type, and
 * its markup (##, **, [ ], links…) only appears on the element the cursor is in.
 */

/** A real checkbox in place of "[ ]" / "[x]"; clicking it flips the mark in the text. */
class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number,
  ) {
    super();
  }
  eq(o: CheckboxWidget) {
    return o.checked === this.checked && o.pos === this.pos;
  }
  toDOM(view: EditorView) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = this.checked;
    box.className = 'cm-md-check';
    box.addEventListener('mousedown', (e) => e.preventDefault());
    box.addEventListener('click', (e) => {
      e.preventDefault();
      view.dispatch({ changes: { from: this.pos + 1, to: this.pos + 2, insert: this.checked ? ' ' : 'x' } });
    });
    return box;
  }
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const dot = document.createElement('span');
    dot.className = 'cm-md-bullet';
    dot.textContent = '•';
    return dot;
  }
}

const STYLES: Record<string, string> = {
  Emphasis: 'cm-md-em',
  StrongEmphasis: 'cm-md-strong',
  Strikethrough: 'cm-md-strike',
  InlineCode: 'cm-md-code',
};
/** Inline elements whose markers hide when the cursor is elsewhere. */
const INLINE_MARKS = new Set(['EmphasisMark', 'StrikethroughMark', 'CodeMark']);

function decorate(view: EditorView): DecorationSet {
  const { state } = view;
  const doc = state.doc;
  const touches = (from: number, to: number) => state.selection.ranges.some((r) => r.from <= to && r.to >= from);
  const out: Range<Decoration>[] = [];
  const hide = (from: number, to: number) => from < to && out.push(Decoration.replace({}).range(from, to));
  const mark = (cls: string, from: number, to: number) => from < to && out.push(Decoration.mark({ class: cls }).range(from, to));
  const lineClass = (cls: string, pos: number) => out.push(Decoration.line({ class: cls }).range(doc.lineAt(pos).from));
  /** End of a marker plus the space after it ("## ", "> "). */
  const withSpace = (to: number) => (doc.sliceString(to, to + 1) === ' ' ? to + 1 : to);
  const eachLine = (from: number, to: number, cls: string) => {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos);
      lineClass(cls, line.from);
      pos = line.to + 1;
    }
  };

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (n: SyntaxNodeRef) => {
        const parent = n.node.parent;
        const heading = /^ATXHeading(\d)$/.exec(n.name);
        if (heading) lineClass(`cm-md-h cm-md-h${heading[1]}`, n.from);
        else if (STYLES[n.name]) mark(STYLES[n.name]!, n.from, n.to);
        else if (n.name === 'HeaderMark' && parent) {
          if (touches(parent.from, parent.to)) mark('cm-md-syntax', n.from, n.to);
          else hide(n.from, withSpace(n.to));
        } else if (INLINE_MARKS.has(n.name) && parent && STYLES[parent.name]) {
          if (touches(parent.from, parent.to)) mark('cm-md-syntax', n.from, n.to);
          else hide(n.from, n.to);
        } else if (n.name === 'Link') {
          const active = touches(n.from, n.to);
          mark('cm-md-link', n.from, n.to);
          if (!active) {
            // Show only the label: hide "[", "](url)".
            for (let c = n.node.firstChild; c; c = c.nextSibling) if (c.name === 'LinkMark' || c.name === 'URL') hide(c.from, c.to);
          }
          return false;
        } else if (n.name === 'URL' && parent?.name !== 'Link') mark('cm-md-link', n.from, n.to);
        else if (n.name === 'Blockquote') eachLine(n.from, n.to, 'cm-md-quote');
        else if (n.name === 'QuoteMark') {
          const line = doc.lineAt(n.from);
          if (touches(line.from, line.to)) mark('cm-md-syntax', n.from, n.to);
          else hide(n.from, withSpace(n.to));
        } else if (n.name === 'FencedCode') {
          eachLine(n.from, n.to, 'cm-md-codeblock');
          for (let c = n.node.firstChild; c; c = c.nextSibling) if (c.name === 'CodeMark' || c.name === 'CodeInfo') mark('cm-md-syntax', c.from, c.to);
          return false;
        } else if (n.name === 'HorizontalRule') {
          lineClass('cm-md-hr', n.from);
          if (!touches(n.from, n.to)) hide(n.from, n.to);
        } else if (n.name === 'ListMark' && parent) {
          const task = parent.getChild('Task');
          const marker = task?.getChild('TaskMarker');
          if (task && marker) {
            const checked = /x/i.test(doc.sliceString(marker.from, marker.to));
            if (checked) mark('cm-md-done', withSpace(marker.to), task.to);
            // "- [ ]" becomes a checkbox unless the cursor is right on it.
            if (touches(n.from, marker.to)) mark('cm-md-syntax', n.from, marker.to);
            else {
              hide(n.from, marker.from);
              out.push(Decoration.replace({ widget: new CheckboxWidget(checked, marker.from) }).range(marker.from, marker.to));
            }
          } else if (/^[-*+]$/.test(doc.sliceString(n.from, n.to))) {
            if (touches(n.from, n.to)) mark('cm-md-syntax', n.from, n.to);
            else out.push(Decoration.replace({ widget: new BulletWidget() }).range(n.from, n.to));
          } else mark('cm-md-num', n.from, n.to);
        }
        return undefined;
      },
    });
  }
  return Decoration.set(out, true);
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = decorate(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet) this.decorations = decorate(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);
