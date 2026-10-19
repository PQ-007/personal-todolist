/** Google Calendar colorIds we offer, mapped to the planner's own palette. */
export const COLORS: Record<string, string> = {
  '9': '#4f8cff',
  '3': '#a06bff',
  '10': '#33c98a',
  '6': '#ffae42',
  '11': '#ff6b6b',
  '8': '#8c96b3',
};

export const COLOR_NAMES: Record<string, string> = {
  '9': 'Blue',
  '3': 'Purple',
  '10': 'Green',
  '6': 'Orange',
  '11': 'Red',
  '8': 'Gray',
};

export const DEFAULT_COLOR = '9';
export const colorOf = (id: string) => COLORS[id] ?? COLORS[DEFAULT_COLOR]!;
