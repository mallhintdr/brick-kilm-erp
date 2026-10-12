import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, fmtDateTime } from '../api.js';

export default function AuditLogs() {
  const t = useT();
  const [action, setAction] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [data, setData] = useState({ total: 0, actions: [], entries: [] });
  const [err, setErr] = useState('');
  const [colFilters, setColFilters] = useState({});

  useEffect(() => {
    let qs = '?limit=200';
    if (action) qs += `&action=${encodeURIComponent(action)}`;
    if (fromDate) qs += `&from=${fromDate}`;
    if (toDate) qs += `&to=${toDate}`;
    get(`/audit-logs${qs}`).then(setData).catch((e) => setErr(e.message));
  }, [action, fromDate, toDate]);

  return (
    <div className="grid">
      <div className="card grid" style={{ gap: '0.65rem' }}>
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.35rem' }}>
          <button className={action === '' ? 'primary' : 'ghost'} style={{ minHeight: '34px', padding: '0.25rem 0.65rem', fontSize: '0.82rem' }} onClick={() => setAction('')}>{t.all}</button>
          {data.actions.map((a) => (
            <button key={a} className={action === a ? 'primary' : 'ghost'} style={{ minHeight: '34px', padding: '0.25rem 0.65rem', fontSize: '0.82rem' }} onClick={() => setAction(a)}>{a}</button>
          ))}
        </div>

        {/* Custom Date Range Picker */}
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

      {err && <p role="alert" className="err">{err}</p>}

      <div className="card table-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem' }}>
          <h2 style={{ margin: 0, border: 'none', padding: 0 }}>🛡️ {t.auditLogs} ({data.entries.filter((e) => {
            if (colFilters.at && !String(fmtDateTime(e.at)).toLowerCase().includes(colFilters.at.toLowerCase())) return false;
            if (colFilters.actor && !String(e.actor || '').toLowerCase().includes(colFilters.actor.toLowerCase())) return false;
            if (colFilters.action && !String(e.action || '').toLowerCase().includes(colFilters.action.toLowerCase())) return false;
            if (colFilters.details && !String(summarize(e.data)).toLowerCase().includes(colFilters.details.toLowerCase())) return false;
            return true;
          }).length} / {data.entries.length})</h2>
          {Object.values(colFilters).some(Boolean) && (
            <button type="button" className="clear-filter-btn" onClick={() => setColFilters({})}>
              ✕ Clear Filters
            </button>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th className="rownum">#</th>
              <th>{t.dateTime}</th>
              <th>{t.name}</th>
              <th>{t.type}</th>
              <th>{t.details}</th>
            </tr>
            <tr className="filter-row">
              <th className="rownum" />
              <th><input type="search" className="table-col-filter" value={colFilters.at || ''} onChange={(e) => setColFilters({ ...colFilters, at: e.target.value })} /></th>
              <th><input type="search" className="table-col-filter" value={colFilters.actor || ''} onChange={(e) => setColFilters({ ...colFilters, actor: e.target.value })} /></th>
              <th><input type="search" className="table-col-filter" value={colFilters.action || ''} onChange={(e) => setColFilters({ ...colFilters, action: e.target.value })} /></th>
              <th><input type="search" className="table-col-filter" value={colFilters.details || ''} onChange={(e) => setColFilters({ ...colFilters, details: e.target.value })} /></th>
            </tr>
          </thead>
          <tbody>
            {data.entries
              .filter((e) => {
                if (colFilters.at && !String(fmtDateTime(e.at)).toLowerCase().includes(colFilters.at.toLowerCase())) return false;
                if (colFilters.actor && !String(e.actor || '').toLowerCase().includes(colFilters.actor.toLowerCase())) return false;
                if (colFilters.action && !String(e.action || '').toLowerCase().includes(colFilters.action.toLowerCase())) return false;
                if (colFilters.details && !String(summarize(e.data)).toLowerCase().includes(colFilters.details.toLowerCase())) return false;
                return true;
              })
              .map((e, i) => (
                <tr key={e._id}>
                  <td className="rownum">{i + 1}</td>
                  <td>{fmtDateTime(e.at)}</td>
                  <td><strong>{e.actor}</strong></td>
                  <td><span className="badge" style={{ background: '#f1f5f9', color: '#1e293b' }}>{e.action}</span></td>
                  <td>{summarize(e.data)}</td>
                </tr>
              ))}
            {!data.entries.length && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: '1.5rem' }}>{t.noEntries}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Keeps the Details column compact: show the fields a munshi would recognize, not raw JSON.
function summarize(data) {
  if (!data || typeof data !== 'object') return '';
  const picked = ['amount', 'reason', 'key', 'kind', 'id', 'workerId', 'label'];
  const parts = picked.filter((k) => data[k] !== undefined).map((k) => `${k}: ${data[k]}`);
  return parts.join(', ') || JSON.stringify(data).slice(0, 80);
}
