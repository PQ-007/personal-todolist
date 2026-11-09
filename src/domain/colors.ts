import type { MsgKey } from '../i18n';

/** Google Calendar colorIds we offer, mapped to the planner's own palette. */
export const COLORS: Record<string, string> = {
  '9': '#4f8cff',
  '3': '#a06bff',
  '10': '#33c98a',
  '6': '#ffae42',
  '11': '#ff6b6b',
  '8': '#8c96b3',
};

export const COLOR_NAMES: Record<string, MsgKey> = {
  '9': 'color.blue',
  '3': 'color.purple',
  '10': 'color.green',
  '6': 'color.orange',
  '11': 'color.red',
  '8': 'color.gray',
};

/** Where each color's gradient ends: a neighbouring hue, so cards shade from one to the other. */
export const COLOR_ENDS: Record<string, string> = {
  '9': '#7b61ff',
  '3': '#e26bd6',
  '10': '#22b8c8',
  '6': '#ff7a59',
  '11': '#ff5c9d',
  '8': '#6f7b9e',
};

export const DEFAULT_COLOR = '9';
export const colorOf = (id: string) => COLORS[id] ?? COLORS[DEFAULT_COLOR]!;
export const colorEndOf = (id: string) => (COLORS[id] ? COLOR_ENDS[id]! : COLOR_ENDS[DEFAULT_COLOR]!);

/** The CSS variables a colored element uses: `--c` and its gradient end `--c2`. */
export const colorVars = (id: string) => ({ '--c': colorOf(id), '--c2': colorEndOf(id) });
