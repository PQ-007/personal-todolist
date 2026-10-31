import type { Label } from '../domain/labels';
import type { KV } from './demo/demoStore';

/** A reusable starting point for a task: its notes (a checklist, usually) and how it looks. */
export interface Template {
  id: string;
  name: string;
  title: string;
  description: string;
  colorId: string;
  label?: Label;
  tags?: string[];
}

const KEY = 'planner_templates';

const isTemplate = (x: unknown): x is Template =>
  !!x && typeof x === 'object' && typeof (x as Template).id === 'string' && typeof (x as Template).name === 'string' && typeof (x as Template).description === 'string';

/** Templates saved in this browser, shared by the demo and Google Calendar. */
export function createTemplateStore(kv: KV = localStorage) {
  const load = (): Template[] => {
    try {
      const items: unknown = JSON.parse(kv.getItem(KEY) ?? '[]');
      return Array.isArray(items) ? items.filter(isTemplate) : [];
    } catch {
      return [];
    }
  };
  const save = (items: Template[]) => {
    try {
      kv.setItem(KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable */
    }
  };
  return {
    load,
    /** Saves `t` as a new template, replacing one with the same name. Returns the list. */
    add(t: Omit<Template, 'id'>): Template[] {
      const same = (x: Template) => x.name.trim().toLocaleLowerCase() === t.name.trim().toLocaleLowerCase();
      const list = load();
      const old = list.find(same);
      const next = [...list.filter((x) => !same(x)), { ...t, id: old?.id ?? `tpl-${Date.now().toString(36)}` }].sort((a, b) => a.name.localeCompare(b.name));
      save(next);
      return next;
    },
    remove(id: string): Template[] {
      const next = load().filter((x) => x.id !== id);
      save(next);
      return next;
    },
  };
}

export const templates = createTemplateStore();
