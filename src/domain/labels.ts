/** Every task can be marked as work or personal (or left unlabeled). */
export type Label = 'work' | 'personal';
/** Which tasks to show: everything, or one label. Unlabeled tasks only show under "all". */
export type LabelFilter = 'all' | Label;

export const LABELS: readonly Label[] = ['work', 'personal'];
export const isLabel = (v: unknown): v is Label => v === 'work' || v === 'personal';

export const matchesFilter = (t: { label?: Label }, f: LabelFilter) => f === 'all' || t.label === f;
/** The label new tasks get under a filter. */
export const labelFor = (f: LabelFilter): Label | undefined => (f === 'all' ? undefined : f);
