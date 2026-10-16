import { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n.js';
import { get, post, uuid, fmtDate } from '../api.js';

const iso = (d) => d.toISOString().slice(0, 10);
const todayIso = () => iso(new Date());
// kiln weeks run Saturday -> Friday, as in moulding
const weekStartOf = (s) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7)); return iso(d); };
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

// Weekly entry for bharai (kind="bharai") or nikasi (kind="nikasi"): workers x Saturday-Friday.
// Days already recorded show their total; empty days take new counts, saved in one go.
export default function WorkWeekGrid({ kind }) {
  const t = useT();
  const category = kind;
  const [weekStart, setWeekStart] = useState(weekStartOf(todayIso()));
  const [grade, setGrade] = useState('awwal');
  const [workers, setWorkers] = useState([]);
  const [saved, setSaved] = useState({}); // workerId|date -> count
  const [grid, setGrid] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: '', bad: false });
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  useEffect(() => { get('/workers').then((w) => setWorkers(w.filter((x) => x.category === category && x.status !== 'inactive').sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {}); }, [category]);
  const loadSaved = () => get(`/work-week?kind=${kind}&from=${days[0]}&to=${days[6]}${kind === 'nikasi' ? `&grade=${grade}` : ''}`)
    .then((rows) => setSaved(Object.fromEntries(rows.map((r) => [`${r.workerId}|${r.date}`, r.count])))).catch(() => setSaved({}));
  useEffect(() => { loadSaved(); }, [weekStart, grade, kind]);

  const val = (w, d) => saved[`${w}|${d}`] ?? (Number(grid[w]?.[d]) || 0);
  const rowTotal = (w) => days.reduce((a, d) => a + val(w, d), 0);
  const dayTotal = (d) => workers.reduce((a, w) => a + val(w._id, d), 0);
  const newCells = workers.flatMap((w) => days.filter((d) => saved[`${w._id}|${d}`] == null && Number(grid[w._id]?.[d]) > 0).map((d) => ({ w: w._id, d, count: Number(grid[w._id][d]) })));

  async function saveWeek() {
    setBusy(true);
    let ok = 0; const failed = [];
    for (const c of newCells) {
      try {
        await post('/work-entries', { kind, workerId: c.w, date: c.d, count: c.count, ...(kind === 'nikasi' ? { grade } : {}), clientUuid: uuid() });
        ok++;
        setGrid((g) => ({ ...g, [c.w]: { ...g[c.w], [c.d]: '' } }));
      } catch (e) { failed.push(`${fmtDate(c.d)}: ${e.message}`); }
    }
    setBusy(false);
    setMsg(failed.length ? { text: `${ok} ${t.savedOk}; ${failed.join(' | ')}`, bad: true } : { text: `${ok} ${t.savedOk}`, bad: false });
    loadSaved();
  }

  return (
    <details className="card week-card">
      <summary className="week-summary"><h2>{t.weeklyEntry} — {kind === 'bharai' ? t.loadingBharai : t.unloadingNikasi}</h2></summary>
      <div className="grid week-body">
        <div className="week-controls">
          <div className="row" style={{ alignItems: 'center', gap: '0.35rem' }}>
            <button type="button" className="ghost" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">‹</button>
            <div className="week-range">
              <span>{t.fromDate}</span><span>{t.toDate}</span>
              <strong>{fmtDate(days[0])}</strong><strong>{fmtDate(days[6])}</strong>
            </div>
            <button type="button" className="ghost" disabled={days[6] >= todayIso()} onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">›</button>
          </div>
          {kind === 'nikasi' && (
            <div className="unit-switch" role="group" aria-label={t.grade}>
              {['awwal', 'doem', 'khangar'].map((g) => (
                <button key={g} type="button" className={grade === g ? 'on' : ''} aria-pressed={grade === g} onClick={() => setGrade(g)}>{t[g]}</button>
              ))}
            </div>
          )}
        </div>
        <div className="table-wrap">
          <table className="week-grid">
            <thead>
              <tr>
                <th className="sticky-col">{t.name}</th>
                {days.map((d) => <th key={d}>{fmtDate(d).slice(0, 5)}</th>)}
                <th>{t.total}</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w._id}>
                  <td><strong>{w.name}</strong></td>
                  {days.map((d) => {
                    const sv = saved[`${w._id}|${d}`];
                    if (sv != null) return <td key={d} className="week-cell-saved">{sv.toLocaleString()}</td>;
                    return (
                      <td key={d}>
                        <input inputMode="numeric" aria-label={`${w.name} ${d}`} disabled={d > todayIso()}
                          value={grid[w._id]?.[d] ?? ''} onChange={(e) => setGrid((g) => ({ ...g, [w._id]: { ...(g[w._id] || {}), [d]: e.target.value.replace(/[^\d]/g, '') } }))} />
                      </td>
                    );
                  })}
                  <td><strong>{rowTotal(w._id).toLocaleString()}</strong></td>
                </tr>
              ))}
              {!workers.length && <tr><td colSpan={9} className="muted">{t.noWorkersInCategory}</td></tr>}
            </tbody>
            <tfoot>
              <tr>
                <td>{t.total}</td>
                {days.map((d) => <td key={d}>{dayTotal(d).toLocaleString()}</td>)}
                <td>{workers.reduce((a, w) => a + rowTotal(w._id), 0).toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <button type="button" className="primary fit-center" disabled={busy || !newCells.length} onClick={saveWeek}>
          {busy ? '...' : `💾 ${t.saveWeek}`}
        </button>
        {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>{msg.text}</p>}
      </div>
    </details>
  );
}
