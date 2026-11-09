import { DEFAULT_COLOR } from '../../domain/colors';
import { addMin } from '../../domain/dates';
import type { Label } from '../../domain/labels';
import { formatTags, parseTagField } from '../../domain/tags';
import type { Task } from '../../domain/types';
import { formFromTask, type WhenForm } from '../../domain/when';
import type { Template } from '../../state/planner';

/** What the task dialog opens on. */
export type ModalTarget =
  | { kind: 'view'; id: string }
  | { kind: 'edit'; id: string }
  /** `todo`: start as a to-do (no time, goes to the stack) rather than a calendar task. */
  | { kind: 'new'; start: Date; label?: Label; todo?: boolean };

/** The task dialog's form, as typed. */
export interface Draft {
  title: string;
  description: string;
  colorId: string;
  label?: Label;
  /** Tags as typed: "#report #urgent". */
  tagsText: string;
  done: boolean;
  when: WhenForm;
  /** See Task.reminders: unset is the calendar's default. */
  reminders?: number[];
}

/** The task being edited (null for a new one) and the form it starts with. */
export function initialDraft(target: ModalTarget, find: (id: string) => Task | undefined): { task: Task | null; draft: Draft } {
  if (target.kind === 'edit') {
    const t = find(target.id);
    if (t) {
      return {
        task: t,
        draft: { title: t.title, description: t.description, colorId: t.colorId, label: t.label, tagsText: formatTags(t.tags), done: t.done, when: formFromTask(t), reminders: t.reminders },
      };
    }
  }
  const start = target.kind === 'new' ? target.start : new Date();
  return {
    task: null,
    draft: {
      title: '',
      description: '',
      colorId: DEFAULT_COLOR,
      label: target.kind === 'new' ? target.label : undefined,
      tagsText: '',
      done: false,
      when: formFromTask({ start, end: addMin(start, 60), allDay: false }),
    },
  };
}

/** A template applied to a draft: its notes go after any already written; its title only fills an empty one. */
export function withTemplate(d: Draft, tpl: Template): Draft {
  return {
    ...d,
    title: d.title.trim() ? d.title : tpl.title,
    description: d.description.trim() ? `${d.description.trimEnd()}\n\n${tpl.description}` : tpl.description,
    colorId: tpl.colorId,
    label: tpl.label,
    tagsText: tpl.tags?.length ? formatTags(tpl.tags) : d.tagsText,
  };
}

/** A draft saved as a template, named after its title (or its first line of notes). */
export function templateFrom(d: Draft): Omit<Template, 'id'> {
  const name = d.title.trim() || d.description.trim().split('\n')[0]!.replace(/^[-*#\s[\]x]+/i, '').slice(0, 60);
  return { name, title: d.title.trim(), description: d.description, colorId: d.colorId, label: d.label, tags: parseTagField(d.tagsText) };
}

/** Whether a draft has anything worth saving as a template. */
export const canBeTemplate = (d: Draft) => !!(d.title.trim() || d.description.trim());
