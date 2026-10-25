import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown';
import { LanguageSupport } from '@codemirror/language';
import { EditorState, Prec, Transaction } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { insertLinePrefix, wrapSelection, type Edit } from '../domain/editing';
import { t } from '../i18n';
import { livePreview } from './livePreview';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

/**
 * Markdown notes with Obsidian-style live preview (see livePreview.ts), a small toolbar and
 * list continuation on Enter. CodeMirror keeps its own undo history and handles IME input.
 * Loaded lazily, so it's the default export.
 */
export default function MarkdownEditor({ value, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  });

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        extensions: [
          // Ctrl/⌘+Enter saves; let it reach the modal instead of inserting a line.
          Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => true }])),
          history(),
          // GFM without markdown()'s embedded HTML/CSS/JS parsers, which triple the bundle.
          new LanguageSupport(markdownLanguage),
          keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ id: 'm-desc', 'aria-label': t('md.label'), spellcheck: 'false' }),
          placeholder(t('md.placeholder')),
          livePreview,
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !u.transactions.some((tr) => tr.annotation(Transaction.remote))) changed.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, []);

  // Text set from outside (first render, checkbox toggled elsewhere) isn't an undoable edit.
  useEffect(() => {
    const v = view.current;
    if (!v || v.state.doc.toString() === value) return;
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: value },
      annotations: [Transaction.remote.of(true), Transaction.addToHistory.of(false)],
    });
  }, [value]);

  const apply = (make: (doc: string, from: number, to: number) => Edit) => {
    const v = view.current;
    if (!v) return;
    const { from, to } = v.state.selection.main;
    const e = make(v.state.doc.toString(), from, to);
    v.dispatch({ changes: { from: e.from, to: e.to, insert: e.text }, selection: { anchor: e.caret }, userEvent: 'input', scrollIntoView: true });
    v.focus();
  };

  return (
    <>
      <div className="toolbar" role="toolbar" aria-label={t('md.toolbar')}>
        <button type="button" onClick={() => apply((doc, from) => insertLinePrefix(doc, from, '- [ ] '))}>
          {t('md.checklist')}
        </button>
        <button type="button" onClick={() => apply((doc, from) => insertLinePrefix(doc, from, '- '))}>
          {t('md.bullet')}
        </button>
        <button type="button" onClick={() => apply((doc, from) => insertLinePrefix(doc, from, '## '))}>
          {t('md.heading')}
        </button>
        <button type="button" onClick={() => apply((doc, from, to) => wrapSelection(doc, from, to, '**'))}>
          {t('md.bold')}
        </button>
      </div>
      <div ref={host} className="mdedit" />
    </>
  );
}
