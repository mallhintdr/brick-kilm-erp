import { useCallback, useEffect, useState } from 'react';
import { get } from './api.js';
import { useLang } from './i18n.js';

export const typeLabel = (t, lang) => (lang === 'ur' && t.labelUr ? t.labelUr : t.label);

// Live, owner-editable lookup list (worker categories, purchase items, ...).
// `active` feeds <select>s; `label(key)` renders stored keys, falling back to the raw key
// so records that reference a since-deactivated type still display.
export function useTypes(kind) {
  const { lang } = useLang();
  const [types, setTypes] = useState([]);
  const reload = useCallback(() => get(`/types?kind=${kind}`).then(setTypes).catch(() => {}), [kind]);
  useEffect(() => { reload(); }, [reload]);
  const label = (key) => {
    const t = types.find((x) => x.key === key);
    return t ? typeLabel(t, lang) : key;
  };
  return { types, active: types.filter((t) => t.active), label, reload };
}
