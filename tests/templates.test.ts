import { describe, expect, it } from 'vitest';
import { createTemplateStore } from '../src/data/templateStore';

describe('templates', () => {
  it('adds, replaces by name and removes', () => {
    localStorage.clear();
    const store = createTemplateStore(localStorage);
    store.add({ name: 'Packing', title: 'Pack', description: '- [ ] Passport', colorId: '9' });
    const list = store.add({ name: 'packing', title: 'Pack', description: '- [ ] Passport\n- [ ] Charger', colorId: '9' });
    expect(list).toHaveLength(1);
    expect(list[0]!.description).toContain('Charger');
    expect(store.remove(list[0]!.id)).toEqual([]);
  });
});
