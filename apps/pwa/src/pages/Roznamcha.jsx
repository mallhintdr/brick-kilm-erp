import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, fmtDate } from '../api.js';

const today = () => new Date().toISOString().slice(0, 10);
const TYPES = ['moulding', 'bharai', 'nikasi', 'sale', 'payment', 'purchase', 'coalArrival', 'coalUse', 'peshgi', 'dasti', 'issue'];

// Roznamcha: the day's report, every entry made that day in time order.
export default function Roznamcha() {
  const t = useT();
  const [date, setDate] = useState(today());
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [lf, setLf] = useState({});

  useEffect(() => {
    setErr('');
    get(`/roznamcha?date=${date}`).then(setData).catch((e) => setErr(e.message));
  }, [date]);

  const typeText = (k) => t[`rz_${k}`] || k;
  const has = (v, q) => !q || String(v ?? '').toLowerCase().includes(q.toLowerCase());
  const rows = (data?.rows || []).filter((r) => has(typeText(r.type), lf.type) && has(r.detail, lf.detail));
  const count = (k) => (data?.rows || []).filter((r) => r.type === k).length;

  return (
    <div className="grid">
      <div className="card grid">
        <h2>{t.roznamcha}</h2>
        <div className="row" style={{ justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
          <input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: '200px' }} />
          <strong>{fmtDate(date)}</strong>
        </div>
        {err && <p className="err" role="alert">{err}</p>}
      </div>

      {data && (
        <div className="kpi-section">
          <div className="kpi-group">
            <h3 className="kpi-group-title">{t.daySummary}</h3>
            <div className="kpi-grid">
              {TYPES.filter((k) => count(k)).map((k) => (
                <div key={k} className="stat"><span>{typeText(k)}</span><strong>{count(k)}</strong></div>
              ))}
              {!data.rows.length && <div className="stat"><span>{t.noEntries}</span><strong>0</strong></div>}
            </div>
          </div>
        </div>
      )}

      {data && (
        <div className="card table-wrap">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem' }}>
            <h2 style={{ margin: 0, border: 'none', padding: 0 }}>{t.roznamcha} ({rows.length})</h2>
            {Object.values(lf).some(Boolean) && <button type="button" className="clear-filter-btn" onClick={() => setLf({})}>✕ {t.clearAll}</button>}
          </div>
          <table>
            <thead>
              <tr>
                <th className="rownum">{t.serialNo}</th>
                <th>{t.wxTime}</th>
                <th className="sticky-col">{t.entryType}</th>
                <th>{t.details}</th>
                <th>{t.amount}</th>
              </tr>
              <tr className="filter-row">
                <th className="rownum" /><th />
                <th className="sticky-col"><input type="search" className="table-col-filter" aria-label="type" value={lf.type || ''} onChange={(e) => setLf({ ...lf, type: e.target.value })} /></th>
                <th><input type="search" className="table-col-filter" aria-label="detail" value={lf.detail || ''} onChange={(e) => setLf({ ...lf, detail: e.target.value })} /></th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.no}>
                  <td className="rownum">{r.no}</td>
                  <td>{new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td><span className={`badge rz-${r.type}`}>{typeText(r.type)}</span></td>
                  <td className="issues-cell">{r.detail}</td>
                  <td>{r.amount ? <strong>{Number(r.amount).toLocaleString()}</strong> : r.qty ? Number(r.qty).toLocaleString() : '—'}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={5} className="muted">{t.noEntries}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
