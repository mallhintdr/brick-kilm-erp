import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, fmtDateTime } from '../api.js';

const KIND_LABEL_KEY = {
  moulding: 'moulding', load: 'loadSection', firing: 'firing', unload: 'nikasiTab',
  grn: 'grnTitle', invoice: 'newInvoice', payment: 'recordPayment', ledger: 'ledgerHistory',
};

export default function Activity() {
  const t = useT();
  const [rows, setRows] = useState([]);
  const [kind, setKind] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [colFilters, setColFilters] = useState({});
  const updateColFilter = (k, v) => setColFilters((prev) => ({ ...prev, [k]: v }));
  const clearColFilters = () => setColFilters({});
  const hasActiveColFilters = Object.values(colFilters).some(Boolean);

  const filtered = rows.filter((r) => {
    if (kind !== 'all' && r.kind !== kind) return false;
    if (fromDate) {
      const dt = new Date(r.at);
      const fdt = new Date(`${fromDate}T00:00:00.000Z`);
      if (dt < fdt) return false;
    }
    if (toDate) {
      const dt = new Date(r.at);
      const tdt = new Date(`${toDate}T23:59:59.999Z`);
      if (dt > tdt) return false;
    }
    if (colFilters.at && !String(fmtDateTime(r.at)).toLowerCase().includes(colFilters.at.toLowerCase())) return false;
    if (colFilters.kind && !String(t[KIND_LABEL_KEY[r.kind]] || r.kind).toLowerCase().includes(colFilters.kind.toLowerCase())) return false;
    if (colFilters.summary && !String(r.summary || '').toLowerCase().includes(colFilters.summary.toLowerCase())) return false;
    return true;
  });

  const kinds = ['all', ...new Set(rows.map((r) => r.kind))];

  return (
    <div className="grid">
      {/* Filters: Category & Custom Date Range */}
      <div className="card grid" style={{ gap: '0.65rem' }}>
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.35rem' }}>
          {kinds.map((k) => (
            <button key={k} className={k === kind ? 'primary' : 'ghost'} style={{ minHeight: '34px', padding: '0.25rem 0.65rem', fontSize: '0.82rem' }} onClick={() => setKind(k)}>
              {k === 'all' ? t.all : (t[KIND_LABEL_KEY[k]] || k)}
            </button>
          ))}
        </div>

        {/* Custom Range Picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', paddingTop: '0.45rem', borderTop: '1px solid var(--line-subtle)' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a' }}>📅 {t.customRange}:</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 700 }}>{t.fromDate}:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{ minHeight: '34px', padding: '0.2rem 0.5rem', fontSize: '0.82rem' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 700 }}>{t.toDate}:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{ minHeight: '34px', padding: '0.2rem 0.5rem', fontSize: '0.82rem' }}
            />
          </label>
          {(fromDate || toDate) && (
            <button
              type="button"
              className="ghost"
              style={{ minHeight: '34px', padding: '0.2rem 0.6rem', fontSize: '0.8rem' }}
              onClick={() => { setFromDate(''); setToDate(''); }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="card table-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem' }}>
          <h2 style={{ margin: 0, border: 'none', padding: 0 }}>{t.activity} ({filtered.length} / {rows.length})</h2>
          {hasActiveColFilters && (
            <button type="button" className="clear-filter-btn" onClick={clearColFilters}>
              ✕ Clear Filters
            </button>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th className="rownum">#</th>
              <th>{t.dateTime}</th>
              <th>{t.type}</th>
              <th>{t.details}</th>
            </tr>
            <tr className="filter-row">
              <th className="rownum" />
              <th><input type="search" className="table-col-filter" value={colFilters.at || ''} onChange={(e) => updateColFilter('at', e.target.value)} /></th>
              <th><input type="search" className="table-col-filter" value={colFilters.kind || ''} onChange={(e) => updateColFilter('kind', e.target.value)} /></th>
              <th><input type="search" className="table-col-filter" value={colFilters.summary || ''} onChange={(e) => updateColFilter('summary', e.target.value)} /></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i}>
                <td className="rownum">{i + 1}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.at)}</td>
                <td>{t[KIND_LABEL_KEY[r.kind]] || r.kind}</td>
                <td>{r.summary}</td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: '1.5rem' }}>{t.noEntries}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
