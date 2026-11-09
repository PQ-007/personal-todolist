/**
 * Shortcuts are matched on the physical key, not the character it types, so they work with any
 * keyboard layout: with a Mongolian (Cyrillic) layout "p" types "р", and with Japanese input on
 * a letter key may report "Process". `shortcutKey` gives the US-layout name of the key: "p",
 * "3", "/", or the key name for everything else ("ArrowLeft", "Delete", "Escape"…).
 */
export function shortcutKey(e: KeyboardEvent | { code: string; key: string }): string {
  const { code, key } = e;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^(Digit|Numpad)[0-9]$/.test(code)) return code.slice(-1);
  if (code === 'Slash' || code === 'NumpadDivide') return '/';
  return key;
}

/** Fields where keys type text. Checkboxes, radios and buttons don't count, so ticking a checklist item keeps shortcuts working. */
const TYPING =
  'textarea,select,[contenteditable]:not([contenteditable=false]),input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=range]):not([type=color])';

export const isTyping = (el: EventTarget | null) => el instanceof Element && !!el.closest(TYPING);
