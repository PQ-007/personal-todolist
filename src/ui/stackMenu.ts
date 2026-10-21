import { COLORS, COLOR_NAMES } from '../domain/colors';
import { addDays } from '../domain/dates';
import { LABELS } from '../domain/labels';
import { LENGTHS, type StackItem } from '../domain/stack';
import { fmtDuration, t } from '../i18n';
import { planner } from '../state/planner';
import type { MenuEntry } from './ContextMenu';

/** The actions for one to-do, shared by the focus view and the plan panel. */
export function stackItemMenu(item: StackItem, onEditText?: () => void): MenuEntry[] {
  const today = new Date();
  return [
    { label: t('stack.scheduleToday'), icon: 'clock', onSelect: () => void planner.scheduleItemOn(item.id, today) },
    { label: t('stack.scheduleTomorrow'), icon: 'arrow-right', onSelect: () => void planner.scheduleItemOn(item.id, addDays(today, 1)) },
    { kind: 'separator' },
    {
      kind: 'chips',
      label: t('stack.length'),
      value: String(item.minutes),
      // h:mm stays short in every language ("1 цаг 30 мин" would wrap); the full length is the tooltip.
      options: LENGTHS.map((m) => ({ id: String(m), label: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`, title: fmtDuration(m) })),
      onSelect: (m) => planner.updateStackItem(item.id, { minutes: Number(m) }),
    },
    {
      kind: 'swatches',
      label: t('modal.color'),
      value: item.colorId,
      options: Object.entries(COLORS).map(([id, color]) => ({ id, color, name: t(COLOR_NAMES[id]!) })),
      onSelect: (colorId) => planner.updateStackItem(item.id, { colorId }),
    },
    { kind: 'separator' },
    ...LABELS.map((l) => ({
      label: t(l === 'work' ? 'label.work' : 'label.personal'),
      icon: l,
      checked: item.label === l,
      onSelect: () => planner.updateStackItem(item.id, { label: item.label === l ? undefined : l }),
    })),
    { kind: 'separator' },
    ...(onEditText ? [{ label: t('stack.editText'), icon: 'edit' as const, onSelect: onEditText }] : []),
    { label: t('menu.delete'), icon: 'trash', danger: true, onSelect: () => planner.deleteStackItem(item.id) },
  ];
}
