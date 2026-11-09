import type { KeyboardEvent } from 'react';

/** True while an IME is composing; keyCode 229 covers Safari's confirming Enter. */
export const isImeKey = (e: KeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229;
