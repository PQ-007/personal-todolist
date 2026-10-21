import { describe, expect, it } from 'vitest';
import { extractTags, formatTags, normalizeTags, parseTagField, tagHue, tagsFromStorage, tagsToStorage } from '../src/domain/tags';

describe('tags', () => {
  it('pulls #tags out of text anywhere', () => {
    expect(extractTags('Write #urgent report #q4')).toEqual({ text: 'Write report', tags: ['urgent', 'q4'] });
    expect(extractTags('#報告 日次レポート #急ぎ')).toEqual({ text: '日次レポート', tags: ['報告', '急ぎ'] });
    expect(extractTags('Тайлан #яаралтай')).toEqual({ text: 'Тайлан', tags: ['яаралтай'] });
  });

  it('leaves # that is not a tag alone', () => {
    expect(extractTags('Issue#12 and C# notes')).toEqual({ text: 'Issue#12 and C# notes', tags: [] });
    expect(extractTags('Room # 3')).toEqual({ text: 'Room # 3', tags: [] });
  });

  it('normalizes and dedupes', () => {
    expect(normalizeTags(['#Urgent', 'urgent', ' a,b ', '', '##x'])).toEqual(['Urgent', 'ab', 'x']);
    expect(parseTagField('#a b, c、d #a')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('round-trips through storage and display', () => {
    expect(tagsFromStorage(tagsToStorage(['a', '報告']))).toEqual(['a', '報告']);
    expect(tagsFromStorage('')).toEqual([]);
    expect(formatTags(['a', 'b'])).toBe('#a #b');
  });

  it('gives a tag the same color regardless of case', () => {
    expect(tagHue('Urgent')).toBe(tagHue('urgent'));
    expect(tagHue('a')).not.toBe(tagHue('b'));
  });
});
