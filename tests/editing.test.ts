import { describe, expect, it } from 'vitest';
import { applyEdit, continueList, insertLinePrefix, wrapSelection } from '../src/domain/editing';

const enter = (v: string, pos = v.length) => {
  const e = continueList(v, pos, pos);
  return e && { value: applyEdit(v, e), caret: e.caret };
};

describe('continueList', () => {
  it('continues bullets, checklists and numbers', () => {
    expect(enter('- a')).toEqual({ value: '- a\n- ', caret: 6 });
    expect(enter('- [x] a')).toEqual({ value: '- [x] a\n- [ ] ', caret: 14 });
    expect(enter('9. a')?.value).toBe('9. a\n10. ');
    expect(enter('  * b')?.value).toBe('  * b\n  * ');
    expect(enter('1) x')?.value).toBe('1) x\n2) ');
  });

  it('ends the list on an empty item', () => {
    expect(enter('- a\n- ')).toEqual({ value: '- a\n', caret: 4 });
    expect(enter('- a\n- [ ] ')).toEqual({ value: '- a\n', caret: 4 });
  });

  it('does nothing outside lists or with a selection', () => {
    expect(continueList('plain', 5, 5)).toBeNull();
    expect(continueList('- a', 1, 3)).toBeNull();
  });

  it('works with Japanese item text', () => {
    expect(enter('- [ ] 資料')?.value).toBe('- [ ] 資料\n- [ ] ');
  });
});

describe('toolbar edits', () => {
  it('inserts a prefix at the line start', () => {
    const e = insertLinePrefix('a\nbc', 3, '- [ ] ');
    expect(applyEdit('a\nbc', e)).toBe('a\n- [ ] bc');
    expect(e.caret).toBe(9);
  });

  it('wraps a selection or places the caret between marks', () => {
    const e = wrapSelection('say hi', 4, 6, '**');
    expect(applyEdit('say hi', e)).toBe('say **hi**');
    const f = wrapSelection('ab', 1, 1, '**');
    expect(applyEdit('ab', f)).toBe('a****b');
    expect(f.caret).toBe(3);
  });
});
