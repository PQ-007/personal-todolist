import { useState } from 'react';
import { t as tr } from '../../i18n';
import { planner, type Template } from '../../state/planner';
import { ContextMenu, type MenuEntry, type MenuState } from '../common/ContextMenu';
import { Icon } from '../common/Icon';
import { canBeTemplate, templateFrom, type Draft } from './draft';

/** The templates menu: apply one to the draft, save the draft as one, or delete some. */
export function TemplateButton({ draft, onApply }: { draft: Draft; onApply: (tpl: Template) => void }) {
  const [menu, setMenu] = useState<MenuState | null>(null);

  const save = () => {
    const tpl = templateFrom(draft);
    planner.addTemplate(tpl);
    planner.toast(tr('tpl.saved', { name: tpl.name }));
  };

  const open = (el: HTMLElement, deleting = false) => {
    const list = planner.listTemplates();
    const r = el.getBoundingClientRect();
    const items: MenuEntry[] = deleting
      ? list.map((tpl) => ({ label: tpl.name, icon: 'trash' as const, danger: true, onSelect: () => planner.removeTemplate(tpl.id) }))
      : [
          ...list.map((tpl) => ({ label: tpl.name, icon: 'template' as const, onSelect: () => onApply(tpl) })),
          ...(list.length ? [{ kind: 'separator' as const }] : []),
          { label: tr('tpl.save'), icon: 'plus', disabled: !canBeTemplate(draft), onSelect: save },
          ...(list.length ? [{ label: tr('tpl.delete'), icon: 'trash' as const, onSelect: () => requestAnimationFrame(() => open(el, true)) }] : []),
        ];
    setMenu({ x: r.left, y: r.bottom + 4, label: tr('tpl.title'), items });
  };

  return (
    <>
      <button type="button" className="btn ghost" aria-haspopup="menu" title={tr('tpl.title')} onClick={(e) => open(e.currentTarget)}>
        <Icon name="template" size={16} />
        <span className="btn-label">{tr('tpl.title')}</span>
      </button>
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </>
  );
}
