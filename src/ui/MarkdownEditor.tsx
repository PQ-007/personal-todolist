import { useRef, type KeyboardEvent } from 'react';
import { isImeKey } from './ime';
import { continueList, insertLinePrefix, wrapSelection, type Edit } from '../domain/editing';
import { t } from '../i18n';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

/**
 * Plain textarea with a small toolbar and list continuation. Edits go through
 * execCommand('insertText') when available so the browser's undo history keeps working.
 * While an IME is composing (Japanese input), Enter is left entirely to the IME.
 */
export function MarkdownEditor({ value, onChange }: Props) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);

  const apply = (e: Edit) => {
    const el = ta.current!;
    el.focus();
    el.setSelectionRange(e.from, e.to);
    const ok = e.text ? document.execCommand('insertText', false, e.text) : e.from === e.to || document.execCommand('delete');
    if (!ok) {
      el.setRangeText(e.text, e.from, e.to, 'end');
      onChange(el.value);
    }
    el.setSelectionRange(e.caret, e.caret);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return;
    if (composing.current || isImeKey(e)) return;
    // Ctrl/⌘+Enter (save) is handled by the modal.
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const el = e.currentTarget;
    const edit = continueList(el.value, el.selectionStart, el.selectionEnd);
    if (!edit) return;
    e.preventDefault();
    apply(edit);
  };

  const sel = () => [ta.current?.selectionStart ?? value.length, ta.current?.selectionEnd ?? value.length] as const;

  return (
    <>
      <div className="toolbar" role="toolbar" aria-label={t('md.toolbar')}>
        <button type="button" onClick={() => apply(insertLinePrefix(value, sel()[0], '- [ ] '))}>
          {t('md.checklist')}
        </button>
        <button type="button" onClick={() => apply(insertLinePrefix(value, sel()[0], '- '))}>
          {t('md.bullet')}
        </button>
        <button type="button" onClick={() => apply(insertLinePrefix(value, sel()[0], '## '))}>
          {t('md.heading')}
        </button>
        <button type="button" onClick={() => apply(wrapSelection(value, ...sel(), '**'))}>
          {t('md.bold')}
        </button>
      </div>
      <textarea
        ref={ta}
        id="m-desc"
        className="desc"
        aria-label={t('md.label')}
        spellCheck={false}
        placeholder={t('md.placeholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={() => (composing.current = false)}
      />
    </>
  );
}
