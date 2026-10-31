import { describe, expect, it } from 'vitest';
import { moveListItem } from '../src/domain/markdown/lists';

const md = (...lines: string[]) => lines.join('\n');

describe('moveListItem', () => {
  it('moves a bullet before or after another', () => {
    const src = md('- a', '- b', '- c');
    expect(moveListItem(src, 2, 0, 'before')).toBe(md('- c', '- a', '- b'));
    expect(moveListItem(src, 0, 2, 'after')).toBe(md('- b', '- c', '- a'));
  });

  it('carries sub-items along, and lands after the target\'s sub-items', () => {
    const src = md('- a', '  - a1', '  - a2', '- b', '- c');
    expect(moveListItem(src, 0, 3, 'after')).toBe(md('- b', '- a', '  - a1', '  - a2', '- c'));
    expect(moveListItem(src, 3, 0, 'after')).toBe(md('- a', '  - a1', '  - a2', '- b', '- c'));
    expect(moveListItem(src, 4, 0, 'after')).toBe(md('- a', '  - a1', '  - a2', '- c', '- b'));
  });

  it('takes the indentation of where it lands', () => {
    expect(moveListItem(md('- a', '  - a1', '- b'), 2, 1, 'after')).toBe(md('- a', '  - a1', '  - b'));
    expect(moveListItem(md('- a', '  - a1', '- b'), 1, 2, 'after')).toBe(md('- a', '- b', '- a1'));
  });

  it('renumbers numbered lists and keeps checklist state', () => {
    expect(moveListItem(md('1. one', '2. two', '3. three'), 2, 0, 'before')).toBe(md('1. three', '2. one', '3. two'));
    expect(moveListItem(md('Intro', '- [x] done', '- [ ] open'), 2, 1, 'before')).toBe(md('Intro', '- [ ] open', '- [x] done'));
  });

  it('refuses moves into itself or from a non-item line', () => {
    const src = md('- a', '  - a1', '- b');
    expect(moveListItem(src, 0, 1, 'after')).toBe(src);
    expect(moveListItem(md('text', '- b'), 0, 1, 'after')).toBe(md('text', '- b'));
  });
});
