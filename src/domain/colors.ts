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

export const DEFAULT_COLOR = '9';
export const colorOf = (id: string) => COLORS[id] ?? COLORS[DEFAULT_COLOR]!;
