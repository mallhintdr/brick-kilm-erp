import { useEffect, useMemo, useRef, useState } from 'react';

// Type-to-filter replacement for a long <select>. Every word typed must appear somewhere in an
// option (any order, any case), so "awwal 5500" keeps only options containing both words.
// options: [{ value, label, search? }] — `search` adds hidden text to match on.
export const matchesAll = (text, query) => {
  const hay = String(text).toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
};

export default function SearchSelect({ options, value, onChange, placeholder, required, ariaLabel, emptyText = '—' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const listRef = useRef(null);
  const selected = options.find((o) => o.value === value);

  const shown = useMemo(
    () => (query ? options.filter((o) => matchesAll(`${o.label} ${o.search || ''}`, query)) : options),
    [options, query],
  );

  useEffect(() => { setActive(0); }, [query, open]);
  useEffect(() => {
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) { setOpen(false); setQuery(''); } };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  useEffect(() => { listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const pick = (o) => { onChange(o.value); setQuery(''); setOpen(false); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && shown[active]) { e.preventDefault(); pick(shown[active]); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  };

  return (
    <div className="search-select" ref={boxRef}>
      <input
        type="search" role="combobox" aria-expanded={open} aria-label={ariaLabel} autoComplete="off"
        placeholder={selected ? selected.label : placeholder}
        className={selected && !open ? 'has-value' : ''}
        value={open ? query : (selected?.label ?? '')}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={onKey}
      />
      {/* keeps native "required" validation working */}
      {required && <input className="search-select-guard" tabIndex={-1} aria-hidden="true" required value={value || ''} onChange={() => {}} />}
      {open && (
        <ul className="search-select-list" role="listbox" ref={listRef}>
          {shown.map((o, i) => (
            <li
              key={o.value} role="option" aria-selected={o.value === value}
              className={`${i === active ? 'active' : ''}${o.value === value ? ' chosen' : ''}`}
              onPointerDown={(e) => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setActive(i)}
            >
              {o.label}
            </li>
          ))}
          {!shown.length && <li className="empty">{emptyText}</li>}
        </ul>
      )}
    </div>
  );
}
