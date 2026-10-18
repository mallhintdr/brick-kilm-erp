import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, post, uuid, fmtDateTime } from '../api.js';
import DateTime from '../components/DateTime.jsx';
import RowActions, { useRowEdit } from '../components/RowActions.jsx';

export default function Firing() {
  const t = useT();
  const editor = useRowEdit();
  const [firemen, setFiremen] = useState([]);
  const [lines, setLines] = useState([]); // lines now firing or preheating
  const [list, setList] = useState([]);
  const [f, setF] = useState({ workerIds: [], shift: 'day', coalKg: '', tempC: '', fanOn: true, genHours: '0', lineIndex: '', time: new Date(Date.now() + 5 * 3600e3).toISOString().slice(11, 16), date: new Date().toISOString().slice(0, 10) });
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState({});

  const load = () => {
    get('/workers').then((w) => setFiremen(w.filter((x) => x.category === 'jalai' && x.status !== 'inactive').sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {});
    get('/firing-logs').then(setList).catch(() => {});
    get('/kiln-lines').then((all) => setLines(all.filter((l) => l.state === 'Firing' || l.state === 'Preheating'))).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    if (!f.workerIds.length) { setMsg({ text: t.chooseFireman, bad: true }); return; }
    setSubmitting(true);
    try {
      const r = await post('/firing-logs', {
        ...f,
        coalKg: Number(f.coalKg),
        tempC: Number(f.tempC),
        genHours: Number(f.genHours),
        lineIndex: f.lineIndex ? Number(f.lineIndex) : undefined,
        time: f.time || undefined,
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
      </div>

      {/* Firing Entry Form */}
      <form className="card grid" onSubmit={submit}>
        <h2>{t.firing} — Shift & Temperature Log</h2>

        <div className="grid two" style={{ gap: '0.9rem' }}>
          <label>
            {t.fireman}
            <select required value={f.workerIds[0] || ''} onChange={(e) => setF({ ...f, workerIds: [e.target.value] })}>
              <option value="" disabled>— {firemen.length ? t.chooseFireman : t.noFiremen} —</option>
              {firemen.map((w) => <option key={w._id} value={w._id}>{w.name}{w.fatherName ? ` — ${w.fatherName}` : ''}</option>)}
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
            {t.entryDate}
            <input type="date" required max={new Date().toISOString().slice(0, 10)} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </label>

          <label>
            {t.time}
            <input type="time" required value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
          </label>

          <label>
            {t.lineNo}
            <select value={f.lineIndex} onChange={(e) => setF({ ...f, lineIndex: e.target.value })}>
              <option value="">—</option>
              {lines.map((l) => <option key={l.index} value={l.index}>{l.index} — {l.state === 'Firing' ? `🔥 ${t.stFiring}` : t.stPreheating}</option>)}
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

        <button className="primary" disabled={submitting}>
          💾 {t.logFiring}
        </button>

        {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>{msg.text}</p>}
      </form>

      {/* Firing History Table with Column Outlines and Quick Filters */}
      <div className="card table-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem' }}>
          <h2 style={{ margin: 0, border: 'none', padding: 0 }}>Firing Logs ({list.filter((f2) => {
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
              <th>{t.lineNo}</th>
              <th>{t.coalKg}</th>
              <th>{t.tempC}</th>
              <th className="actions">{t.action}</th>
            </tr>
            <tr className="filter-row">
              <th className="rownum" />
              <th><input type="search" className="table-col-filter" value={filters.date || ''} onChange={(e) => setFilters({ ...filters, date: e.target.value })} /></th>
              <th><input type="search" className="table-col-filter" value={filters.shift || ''} onChange={(e) => setFilters({ ...filters, shift: e.target.value })} /></th>
              <th />
              <th><input type="search" className="table-col-filter" value={filters.coalKg || ''} onChange={(e) => setFilters({ ...filters, coalKg: e.target.value })} /></th>
              <th><input type="search" className="table-col-filter" value={filters.tempC || ''} onChange={(e) => setFilters({ ...filters, tempC: e.target.value })} /></th>
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
                return true;
              })
              .map((f2, i) => {
                const editing = editor.isEditing(f2._id);
                return (
                <tr key={f2._id}>
                  <td className="rownum">{i + 1}</td>
                  <td><DateTime value={f2.date} /></td>
                  <td>
                    {editing ? (
                      <select className="cell-input" {...editor.field('shift')}>
                        <option value="day">{t.day}</option>
                        <option value="night">{t.night}</option>
                      </select>
                    ) : (
                      <span className="badge" style={{ background: '#f1f5f9', color: '#1e293b' }}>
                        {f2.shift === 'day' ? `☀️ ${t.day}` : `🌙 ${t.night}`}
                      </span>
                    )}
                  </td>
                  <td>{f2.lineIndex || '—'}</td>
                  <td>{editing ? <input inputMode="numeric" className="cell-input" {...editor.field('coalKg')} /> : <strong>{Number(f2.coalKg).toLocaleString()} kg</strong>}</td>
                  <td>{editing ? <input inputMode="numeric" className="cell-input" {...editor.field('tempC')} /> : <strong>{f2.tempC} °C</strong>}</td>
                  <td className="actions">
                    <RowActions
                      editor={editor} id={f2._id} path={`/firing-logs/${f2._id}`} name={fmtDateTime(f2.date)}
                      initial={{ shift: f2.shift, coalKg: String(f2.coalKg), tempC: String(f2.tempC) }}
                      toPayload={(d) => ({ shift: d.shift, coalKg: Number(d.coalKg), tempC: Number(d.tempC) })}
                      onSaved={() => { setMsg({ text: t.savedOk, bad: false }); load(); }}
                      onDeleted={(r) => { setMsg({ text: r?.legacyNoLedgerLink ? `${t.deleted} — ${t.legacyNote}` : t.deleted, bad: false }); load(); }}
                      onError={(m) => setMsg({ text: m, bad: true })}
                    />
                  </td>
                </tr>
                );
              })}
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
