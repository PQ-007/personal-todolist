import { LABELS, type Label } from '../../domain/labels';
import { t as tr } from '../../i18n';
import { Icon } from '../common/Icon';

/** Work, personal, or no label. */
export function LabelPicker({ value, onChange }: { value?: Label; onChange: (label: Label | undefined) => void }) {
  return (
    <div className="mlabel" role="radiogroup" aria-label={tr('label.field')}>
      {[undefined, ...LABELS].map((l) => (
        <button
          key={l ?? 'none'}
          type="button"
          role="radio"
          aria-checked={value === l}
          className={'lblopt' + (l ? ' ' + l : '') + (value === l ? ' on' : '')}
          onClick={() => onChange(l)}
        >
          {l && <Icon name={l} size={14} />}
          {tr(l === 'work' ? 'label.work' : l === 'personal' ? 'label.personal' : 'label.none')}
        </button>
      ))}
    </div>
  );
}
