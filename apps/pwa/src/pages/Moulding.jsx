import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, post, uuid, fmtDateTime } from '../api.js';
import DeleteButton from '../components/DeleteButton.jsx';

export default function Moulding() {
  const t = useT();
  const [teams, setTeams] = useState([]);
  const [list, setList] = useState([]);
  const [f, setF] = useState({ teamId: '', count: '', kharaba: '0' });
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState({});

  const load = () => {
    get('/teams').then((all) => setTeams(all.filter((tm) => tm.category === 'pathera'))).catch(() => {});
    get('/moulding').then(setList).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const r = await post('/moulding', {
        ...f,
        count: Number(f.count),
        kharaba: Number(f.kharaba || 0),
        clientUuid: uuid(),
      });
      setMsg({ text: r.queued ? t.queued : t.savedOk, bad: false });
      setF({ teamId: f.teamId, count: '', kharaba: '0' });
      load();
    } catch (e2) {
      setMsg({ text: e2.message, bad: true });
    } finally {
      setSubmitting(false);
    }
  }

  const totalMoulded = list.reduce((a, b) => a + (Number(b.count) || 0), 0);
  const totalKharaba = list.reduce((a, b) => a + (Number(b.kharaba) || 0), 0);
  const totalNet = list.reduce((a, b) => a + (Number(b.netCount) || 0), 0);

  const currentNet = Math.max(0, (Number(f.count) || 0) - (Number(f.kharaba) || 0));

  return (
    <div className="grid">
      {/* Production KPIs */}
      <div className="kpi-grid">
        <div className="stat" style={{ borderInlineStartColor: 'var(--brand)' }}>
          <span>Total Moulded</span>
          <strong>{totalMoulded.toLocaleString()}</strong>
        </div>
        <div className="stat" style={{ borderInlineStartColor: 'var(--ok)' }}>
          <span>Net Accepted</span>
          <strong className="ok">{totalNet.toLocaleString()}</strong>
        </div>
        <div className="stat" style={{ borderInlineStartColor: totalKharaba > 0 ? 'var(--warn)' : 'var(--muted)' }}>
          <span>{t.kharaba}</span>
          <strong className={totalKharaba > 0 ? 'warn' : ''}>{totalKharaba.toLocaleString()}</strong>
        </div>
      </div>

      {/* Moulding Entry Form */}
      <form className="card grid" onSubmit={submit}>
        <h2>🧱 {t.moulding} (پتھائی) — Batch Entry</h2>

        <div className="grid two" style={{ gap: '0.9rem' }}>
          <label style={{ gridColumn: '1 / -1' }}>
            {t.team} (Pathera)
            <select required value={f.teamId} onChange={(e) => setF({ ...f, teamId: e.target.value })}>
              <option value="" disabled>— Select Pathera Team —</option>
              {teams.map((tm) => <option key={tm._id} value={tm._id}>{tm.label}</option>)}
            </select>
          </label>

          <label>
            {t.count} (Total Moulded)
            <input required inputMode="numeric" placeholder="e.g. 10000" value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} />
          </label>

          <label>
            {t.kharaba} (Rain / Damage Loss)
            <input inputMode="numeric" placeholder="0" value={f.kharaba} onChange={(e) => setF({ ...f, kharaba: e.target.value })} />
          </label>
        </div>

        {/* Live Net Count Preview */}
        {f.count && (
          <div style={{ padding: '0.75rem 1rem', background: 'var(--ok-tint)', border: '1px solid var(--ok-line)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: 'var(--ok-dark)' }}>{t.netCount}:</span>
            <strong style={{ fontSize: '1.2rem', color: 'var(--ok-dark)' }}>{currentNet.toLocaleString()} bricks</strong>
          </div>
        )}

        <button className="primary" disabled={submitting}>
          ➕ {t.add}
        </button>

        {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>{msg.text}</p>}
      </form>

      {/* Moulding Batches Table with Column Outlines and Quick Filters */}
      <div className="card table-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem' }}>
          <h2 style={{ margin: 0, border: 'none', padding: 0 }}>📋 Moulding Logs ({list.filter((b) => {
            if (filters.date && !String(fmtDateTime(b.date)).toLowerCase().includes(filters.date.toLowerCase())) return false;
            if (filters.count && !String(b.count).toLowerCase().includes(filters.count.toLowerCase())) return false;
            if (filters.kharaba && !String(b.kharaba).toLowerCase().includes(filters.kharaba.toLowerCase())) return false;
            if (filters.netCount && !String(b.netCount).toLowerCase().includes(filters.netCount.toLowerCase())) return false;
            return true;
          }).length} / {list.length})</h2>
          {Object.values(filters).some(Boolean) && (
            <button type="button" className="clear-filter-btn" onClick={() => setFilters({})}>
              ✕ Clear Filters
            </button>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th className="rownum">#</th>
              <th>{t.dateTime}</th>
              <th>{t.count}</th>
              <th>{t.kharaba}</th>
              <th>{t.netCount}</th>
              <th className="actions" />
            </tr>
            <tr className="filter-row">
              <th className="rownum" />
              <th><input type="search" className="table-col-filter" value={filters.date || ''} onChange={(e) => setFilters({ ...filters, date: e.target.value })} /></th>
              <th><input type="search" className="table-col-filter" value={filters.count || ''} onChange={(e) => setFilters({ ...filters, count: e.target.value })} /></th>
              <th><input type="search" className="table-col-filter" value={filters.kharaba || ''} onChange={(e) => setFilters({ ...filters, kharaba: e.target.value })} /></th>
              <th><input type="search" className="table-col-filter" value={filters.netCount || ''} onChange={(e) => setFilters({ ...filters, netCount: e.target.value })} /></th>
              <th className="actions" />
            </tr>
          </thead>
          <tbody>
            {list
              .filter((b) => {
                if (filters.date && !String(fmtDateTime(b.date)).toLowerCase().includes(filters.date.toLowerCase())) return false;
                if (filters.count && !String(b.count).toLowerCase().includes(filters.count.toLowerCase())) return false;
                if (filters.kharaba && !String(b.kharaba).toLowerCase().includes(filters.kharaba.toLowerCase())) return false;
                if (filters.netCount && !String(b.netCount).toLowerCase().includes(filters.netCount.toLowerCase())) return false;
                return true;
              })
              .map((b, i) => (
                <tr key={b._id}>
                  <td className="rownum">{i + 1}</td>
                  <td>{fmtDateTime(b.date)}</td>
                  <td><strong>{Number(b.count).toLocaleString()}</strong></td>
                  <td><span className={b.kharaba > 0 ? 'warn' : 'muted'}>{Number(b.kharaba).toLocaleString()}</span></td>
                  <td><strong className="ok">{Number(b.netCount).toLocaleString()}</strong></td>
                  <td className="actions">
                    <DeleteButton
                      path={`/moulding/${b._id}`}
                      name={`${b.netCount} — ${fmtDateTime(b.date)}`}
                      onDone={(r) => { setMsg({ text: r.legacyNoLedgerLink ? `${t.deleted} — ${t.legacyNote}` : t.deleted, bad: false }); load(); }}
                      onError={(m) => setMsg({ text: m, bad: true })}
                    />
                  </td>
                </tr>
              ))}
            {!list.length && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                  {t.noEntries}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
