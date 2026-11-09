import type { MsgKey } from '../i18n';

/**
 * Google Calendar's eleven event colorIds, mapped to the planner's own palette. Google shows
 * its own shades of these in its apps (e.g. 5 is "Banana", 7 "Peacock").
 */
export const COLORS: Record<string, string> = {
  '11': '#ff6b6b',
  '6': '#ffae42',
  '5': '#f5c542',
  '2': '#9bd65b',
  '10': '#33c98a',
  '7': '#29c4e0',
  '9': '#4f8cff',
  '1': '#9b9cff',
  '3': '#a06bff',
  '4': '#ff7ac6',
  '8': '#8c96b3',
};

/** The order colors are offered in: around the color wheel, gray last. */
export const COLOR_IDS = ['11', '6', '5', '2', '10', '7', '9', '1', '3', '4', '8'];

export const COLOR_NAMES: Record<string, MsgKey> = {
  '11': 'color.red',
  '6': 'color.orange',
  '5': 'color.yellow',
  '2': 'color.lime',
  '10': 'color.green',
  '7': 'color.teal',
  '9': 'color.blue',
  '1': 'color.lavender',
  '3': 'color.purple',
  '4': 'color.pink',
  '8': 'color.gray',
};

/** Where each color's gradient ends: a neighbouring hue, so cards shade from one to the other. */
export const COLOR_ENDS: Record<string, string> = {
  '11': '#ff5c9d',
  '6': '#ff7a59',
  '5': '#ffae42',
  '2': '#4fc98a',
  '10': '#22b8c8',
  '7': '#3d8bff',
  '9': '#7b61ff',
  '1': '#c39bff',
  '3': '#e26bd6',
  '4': '#ff9a9a',
  '8': '#6f7b9e',
};

export const DEFAULT_COLOR = '9';
export const colorOf = (id: string) => COLORS[id] ?? COLORS[DEFAULT_COLOR]!;
export const colorEndOf = (id: string) => (COLORS[id] ? COLOR_ENDS[id]! : COLOR_ENDS[DEFAULT_COLOR]!);

/** The CSS variables a colored element uses: `--c` and its gradient end `--c2`. */
export const colorVars = (id: string) => ({ '--c': colorOf(id), '--c2': colorEndOf(id) });

/** Every color as a menu offers it (see ContextMenu's swatches), in `COLOR_IDS` order. */
export const colorOptions = (name: (key: MsgKey) => string) =>
  COLOR_IDS.map((id) => ({ id, color: COLORS[id]!, color2: COLOR_ENDS[id], name: name(COLOR_NAMES[id]!) }));
