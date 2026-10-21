import type { Label } from '../domain/labels';
import { t } from '../i18n';
import { Icon } from './Icon';

/** A small work/personal tag. `iconOnly` fits it into tight spots like calendar cards. */
export function LabelTag({ label, iconOnly }: { label: Label; iconOnly?: boolean }) {
  const name = t(label === 'work' ? 'label.work' : 'label.personal');
  return (
    <span className={'lbl ' + label + (iconOnly ? ' icon-only' : '')} title={name} aria-label={iconOnly ? name : undefined}>
      <Icon name={label} size={iconOnly ? 12 : 13} />
      {!iconOnly && name}
    </span>
  );
}
