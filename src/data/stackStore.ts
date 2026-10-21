import type { StackItem } from '../domain/stack';
import type { KV } from './demo/demoStore';

/**
 * The to-do stack, saved in this browser (one list per data source). Unscheduled to-dos have
 * no time, so they can't live in Google Calendar; Google Tasks sync could replace this later.
 */
export interface StackStore {
  load(): StackItem[];
  save(items: StackItem[]): void;
}

const SAMPLE: StackItem[] = [
  { id: 's1', title: 'Write the RPA how-to', description: '- [ ] Steps with screenshots\n- [ ] Share with the team', colorId: '3', label: 'work', tags: ['rpa', 'docs'], minutes: 60 },
  { id: 's2', title: 'Clean up the shared drive', description: '', colorId: '9', label: 'work', tags: ['admin'], minutes: 45 },
  { id: 's3', title: 'Reply to the vendor', description: '', colorId: '6', label: 'work', tags: ['urgent'], minutes: 15 },
  { id: 's4', title: 'Renew passport', description: '- [ ] Photo\n- [ ] Application form', colorId: '11', label: 'personal', tags: ['urgent', 'errands'], minutes: 30 },
  { id: 's5', title: 'Call grandma', description: '', colorId: '10', label: 'personal', tags: ['family'], minutes: 30 },
];

const isItem = (x: unknown): x is StackItem =>
  !!x && typeof x === 'object' && typeof (x as StackItem).id === 'string' && typeof (x as StackItem).title === 'string';

export function createStackStore(mode: 'demo' | 'google', kv: KV = localStorage): StackStore {
  const key = `planner_stack_${mode}`;
  return {
    load() {
      try {
        const raw = kv.getItem(key);
        // Demo mode starts with a few sample to-dos; Google mode starts empty.
        if (raw == null) return mode === 'demo' ? SAMPLE.map((s) => ({ ...s })) : [];
        const items: unknown = JSON.parse(raw);
        return Array.isArray(items) ? items.filter(isItem) : [];
      } catch {
        return [];
      }
    },
    save(items) {
      try {
        kv.setItem(key, JSON.stringify(items));
      } catch {
        /* storage unavailable: the stack lasts for this session only */
      }
    },
  };
}
