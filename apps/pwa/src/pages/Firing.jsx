import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, post, uuid, fmtDateTime } from '../api.js';
import DeleteButton from '../components/DeleteButton.jsx';

export default function Firing() {
  const t = useT();
  const [teams, setTeams] = useState([]);
  const [list, setList] = useState([]);
  const [f, setF] = useState({ teamId: '', shift: 'day', coalKg: '', tempC: '', fanOn: true, genHours: '0' });
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState({});

  const load = () => {
    get('/teams').then((all) => setTeams(all.filter((tm) => tm.category === 'jalai'))).catch(() => {});
    get('/firing-logs').then(setList).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const r = await post('/firing-logs', {
        ...f,
        coalKg: Number(f.coalKg),
        tempC: Number(f.tempC),
        genHours: Number(f.genHours),
        clientUuid: uuid(),
      });
      const fanWarn = r.fanAlert ? ` — ⚠️ ${t.fanAlertMsg}` : '';
      setMsg({ text: (r.queued ? t.queued : t.savedOk) + fanWarn, bad: !!r.fanAlert });
      setF({ ...f, coalKg: '', tempC: '' });
      load();
    } catch (e2) {
      setMsg({ text: e2.message, bad: true });
    } finally {
      setSubmitting(false);
    }
  }

  const latestTemp = list[0]?.tempC;
  const totalCoalToday = list.reduce((a, l) => a + (Number(l.coalKg) || 0), 0);

  return (
    <div className="grid">
      {/* Thermal & Fuel Stats */}
      <div className="kpi-grid">
        <div className="stat" style={{ borderInlineStartColor: 'var(--brand)' }}>
          <span>Latest Temperature</span>
          <strong>{latestTemp ? `${latestTemp} °C` : '—'}</strong>
        </div>
        <div className="stat" style={{ borderInlineStartColor: '#ea580c' }}>
          <span>Total Coal Logged</span>
          <strong>{totalCoalToday.toLocaleString()} kg</strong>
        </div>
        <div className="stat" style={{ borderInlineStartColor: 'var(--ok)' }}>
          <span>ID Fan Status</span>
          <strong className={list[0]?.fanOn !== false ? 'ok' : 'err'}>
            {list[0]?.fanOn !== false ? '⚡ Active' : '⚠️ Offline'}
          </strong>
        </div>
      </div>

      {/* Firing Entry Form */}
      <form className="card grid" onSubmit={submit}>
        <h2>🔥 {t.firing} — Shift & Temperature Log</h2>

        <div className="grid two" style={{ gap: '0.9rem' }}>
          <label>
            {t.team} (Jalai)
            <select required value={f.teamId} onChange={(e) => setF({ ...f, teamId: e.target.value })}>
              <option value="" disabled>— Select Jalai Team —</option>
              {teams.map((tm) => <option key={tm._id} value={tm._id}>{tm.label}</option>)}
            </select>
          </label>

          <label>
            {t.shift}
            <select value={f.shift} onChange={(e) => setF({ ...f, shift: e.target.value })}>
              <option value="day">☀️ {t.day}</option>
              <option value="night">🌙 {t.night}</option>
            </select>
          </label>

          <label>
            {t.coalKg}
            <input required inputMode="numeric" placeholder="e.g. 1200" value={f.coalKg} onChange={(e) => setF({ ...f, coalKg: e.target.value })} />
          </label>

          <label>
            {t.tempC} (°C)
            <input required inputMode="numeric" placeholder="e.g. 950" value={f.tempC} onChange={(e) => setF({ ...f, tempC: e.target.value })} />
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.85rem 1rem', background: '#f8fafc', borderRadius: '10px', border: '1px solid var(--line)', flexWrap: 'wrap' }}>
          <label className="row" style={{ alignItems: 'center', margin: 0, cursor: 'pointer' }}>
            <input type="checkbox" checked={f.fanOn} onChange={(e) => setF({ ...f, fanOn: e.target.checked })} />
            <span>💨 {t.fanOn}</span>
          </label>

          {!f.fanOn && (
            <label style={{ margin: 0, minWidth: '160px' }}>
              {t.genHours}
              <input inputMode="numeric" placeholder="Hours" value={f.genHours} onChange={(e) => setF({ ...f, genHours: e.target.value })} style={{ minHeight: '38px', padding: '0.3rem 0.6rem' }} />
            </label>
          )}
        </div>

        <button className="primary" disabled={submitting}>
          💾 {t.logFiring}
        </button>

        {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>{msg.text}</p>}
      </form>

      {/* Firing History Table with Column Outlines and Quick Filters */}
      <div className="card table-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem' }}>
          <h2 style={{ margin: 0, border: 'none', padding: 0 }}>📋 Firing Logs ({list.filter((f2) => {
            if (filters.date && !String(fmtDateTime(f2.date)).toLowerCase().includes(filters.date.toLowerCase())) return false;
            if (filters.shift && !String(f2.shift).toLowerCase().includes(filters.shift.toLowerCase())) return false;
            if (filters.coalKg && !String(f2.coalKg).toLowerCase().includes(filters.coalKg.toLowerCase())) return false;
            if (filters.tempC && !String(f2.tempC).toLowerCase().includes(filters.tempC.toLowerCase())) return false;
            if (filters.fanOn && !String(f2.fanOn ? 'on' : 'off').toLowerCase().includes(filters.fanOn.toLowerCase())) return false;
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
              <th>{t.shift}</th>
              <th>{t.coalKg}</th>
              <th>{t.tempC}</th>
              <th>{t.fanOn}</th>
              <th className="actions" />
            </tr>
            <tr className="filter-row">
              <th className="rownum" />
              <th><input type="search" className="table-col-filter" value={filters.date || ''} onChange={(e) => setFilters({ ...filters, date: e.target.value })} /></th>
              <th><input type="search" className="table-col-filter" value={filters.shift || ''} onChange={(e) => setFilters({ ...filters, shift: e.target.value })} /></th>
              <th><input type="search" className="table-col-filter" value={filters.coalKg || ''} onChange={(e) => setFilters({ ...filters, coalKg: e.target.value })} /></th>
              <th><input type="search" className="table-col-filter" value={filters.tempC || ''} onChange={(e) => setFilters({ ...filters, tempC: e.target.value })} /></th>
              <th><input type="search" className="table-col-filter" value={filters.fanOn || ''} onChange={(e) => setFilters({ ...filters, fanOn: e.target.value })} /></th>
              <th className="actions" />
            </tr>
          </thead>
          <tbody>
            {list
              .filter((f2) => {
                if (filters.date && !String(fmtDateTime(f2.date)).toLowerCase().includes(filters.date.toLowerCase())) return false;
                if (filters.shift && !String(f2.shift).toLowerCase().includes(filters.shift.toLowerCase())) return false;
                if (filters.coalKg && !String(f2.coalKg).toLowerCase().includes(filters.coalKg.toLowerCase())) return false;
                if (filters.tempC && !String(f2.tempC).toLowerCase().includes(filters.tempC.toLowerCase())) return false;
                if (filters.fanOn && !String(f2.fanOn ? 'on' : 'off').toLowerCase().includes(filters.fanOn.toLowerCase())) return false;
                return true;
              })
              .map((f2, i) => (
                <tr key={f2._id}>
                  <td className="rownum">{i + 1}</td>
                  <td>{fmtDateTime(f2.date)}</td>
                  <td>
                    <span className="badge" style={{ background: '#f1f5f9', color: '#1e293b' }}>
                      {f2.shift === 'day' ? `☀️ ${t.day}` : `🌙 ${t.night}`}
                    </span>
                  </td>
                  <td><strong>{Number(f2.coalKg).toLocaleString()} kg</strong></td>
                  <td><strong>{f2.tempC} °C</strong></td>
                  <td>
                    <span className={`badge ${f2.fanOn ? 'green' : 'red'}`}>
                      {f2.fanOn ? '✓ On' : '✗ Off'}
                    </span>
                  </td>
                  <td className="actions">
                    <DeleteButton
                      path={`/firing-logs/${f2._id}`}
                      name={fmtDateTime(f2.date)}
                      onDone={(r) => { setMsg({ text: r.legacyNoLedgerLink ? `${t.deleted} — ${t.legacyNote}` : t.deleted, bad: false }); load(); }}
                      onError={(m) => setMsg({ text: m, bad: true })}
                    />
                  </td>
                </tr>
              ))}
            {!list.length && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
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
