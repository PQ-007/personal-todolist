import { describe, expect, it } from 'vitest';
import { shortcutKey } from '../src/ui/keys';

describe('shortcutKey', () => {
  it('uses the physical key, whatever the layout types', () => {
    expect(shortcutKey({ code: 'KeyP', key: 'р' })).toBe('p'); // Mongolian Cyrillic
    expect(shortcutKey({ code: 'KeyT', key: 'Process' })).toBe('t'); // Japanese input on
    expect(shortcutKey({ code: 'Digit3', key: '№' })).toBe('3');
    expect(shortcutKey({ code: 'Numpad5', key: '5' })).toBe('5');
    expect(shortcutKey({ code: 'Slash', key: '.' })).toBe('/');
  });

  it('keeps named keys as they are', () => {
    expect(shortcutKey({ code: 'ArrowLeft', key: 'ArrowLeft' })).toBe('ArrowLeft');
    expect(shortcutKey({ code: 'Delete', key: 'Delete' })).toBe('Delete');
    expect(shortcutKey({ code: '', key: 'x' })).toBe('x');
  });
});
