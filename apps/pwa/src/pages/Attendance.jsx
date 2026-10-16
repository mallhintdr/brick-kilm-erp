import { useEffect, useMemo, useState } from 'react';
import { useT, useLang } from '../i18n.js';
import { get, put, fmtDate } from '../api.js';
import { useTypes, typeLabel } from '../useTypes.js';
import SearchSelect from '../components/SearchSelect.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const STATUSES = ['present', 'absent', 'leave', 'half'];

// Daily attendance: tap P / A / L / ½ for each worker, then save the day.
export default function Attendance() {
  const t = useT();
  const { lang } = useLang();
  const cats = useTypes('workerCategory');
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [workers, setWorkers] = useState([]);
  const [marks, setMarks] = useState({}); // workerId -> status
  const [saved, setSaved] = useState({});
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => { get('/workers').then((w) => setWorkers(w.filter((x) => x.status !== 'inactive').sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {}); }, []);
  useEffect(() => {
    setMsg({ text: '', bad: false });
    get(`/attendance?date=${date}`).then((rows) => {
      const m = Object.fromEntries(rows.map((r) => [r.workerId, r.status]));
      setMarks(m); setSaved(m);
    }).catch(() => { setMarks({}); setSaved({}); });
  }, [date]);

  const shown = useMemo(() => workers.filter((w) => (!category || w.category === category)
    && (!query || `${w.name} ${w.fatherName || ''}`.toLowerCase().includes(query.toLowerCase()))), [workers, category, query]);
  const count = (st) => shown.filter((w) => marks[w._id] === st).length;
  const changed = shown.filter((w) => marks[w._id] && marks[w._id] !== saved[w._id]).length;

  async function save() {
    setBusy(true);
    try {
      const entries = shown.filter((w) => marks[w._id]).map((w) => ({ workerId: w._id, status: marks[w._id] }));
      await put('/attendance', { date, entries });
      setSaved({ ...saved, ...Object.fromEntries(entries.map((e) => [e.workerId, e.status])) });
      setMsg({ text: `${t.savedOk} (${entries.length})`, bad: false });
    } catch (e) { setMsg({ text: e.message, bad: true }); }
    setBusy(false);
  }

  return (
    <div className="grid">
      <div className="card grid">
        <h2>{t.attendance}</h2>
        <div className="grid two">
          <label>{t.date}<input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>
            {t.category}
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">{t.allCategories}</option>
              {cats.active.map((c) => <option key={c.key} value={c.key}>{typeLabel(c, lang)}</option>)}
            </select>
          </label>
          <label>{t.name}<input type="search" placeholder={t.typeToSearch} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        </div>
        <div className="row" style={{ justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="ghost" onClick={() => setMarks({ ...marks, ...Object.fromEntries(shown.map((w) => [w._id, 'present'])) })}>{t.markAllPresent}</button>
          <button type="button" className="primary fit-center" disabled={busy || !shown.some((w) => marks[w._id])} onClick={save}>
            {t.save}{changed ? ` (${changed})` : ''}
          </button>
        </div>
        {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>{msg.text}</p>}
      </div>

      <div className="kpi-section">
        <div className="kpi-group">
          <h3 className="kpi-group-title">{fmtDate(date)}</h3>
          <div className="kpi-grid">
            <div className="stat" style={{ borderInlineStartColor: 'var(--ok-dark)' }}><span>{t.att_present}</span><strong className="ok">{count('present')}</strong></div>
            <div className="stat" style={{ borderInlineStartColor: 'var(--err-dark)' }}><span>{t.att_absent}</span><strong className="err">{count('absent')}</strong></div>
            <div className="stat" style={{ borderInlineStartColor: 'var(--warn-dark)' }}><span>{t.att_leave}</span><strong className="warn">{count('leave')}</strong></div>
            <div className="stat" style={{ borderInlineStartColor: 'var(--info)' }}><span>{t.att_half}</span><strong>{count('half')}</strong></div>
          </div>
        </div>
      </div>

      <WorkerRecord t={t} workers={workers} />

      <div className="card table-wrap">
        <h2>{t.workers} ({shown.length})</h2>
        <table>
          <thead><tr><th className="rownum">#</th><th className="sticky-col">{t.name}</th><th>{t.category}</th><th>{t.attStatus}</th></tr></thead>
          <tbody>
            {shown.map((w, i) => (
              <tr key={w._id}>
                <td className="rownum">{i + 1}</td>
                <td><strong>{w.name}</strong>{w.fatherName ? <span className="muted"> — {w.fatherName}</span> : null}</td>
                <td>{cats.label(w.category)}</td>
                <td>
                  <div className="att-btns" role="radiogroup" aria-label={w.name}>
                    {STATUSES.map((st) => (
                      <button key={st} type="button" role="radio" aria-checked={marks[w._id] === st}
                        className={`att-${st}${marks[w._id] === st ? ' on' : ''}`} onClick={() => setMarks({ ...marks, [w._id]: st })} title={t[`att_${st}`]}>
                        {t[`attShort_${st}`]}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={4} className="muted">{t.noEntries}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// One worker's attendance over the last 7 / 15 / 30 days, day by day, with totals.
// Days with no mark show as "not marked" so gaps are visible.
function WorkerRecord({ t, workers }) {
  const [workerId, setWorkerId] = useState('');
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!workerId) { setRows([]); return; }
    const to = today();
    const from = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
    get(`/attendance/worker/${workerId}?from=${from}&to=${to}`).then(setRows).catch(() => setRows([]));
  }, [workerId, days]);
  const byDate = Object.fromEntries(rows.map((r) => [r.date, r.status]));
  const list = Array.from({ length: days }, (_, i) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  const n = (st) => list.filter((d) => byDate[d] === st).length;
  return (
    <div className="card grid">
      <h2>{t.attRecord}</h2>
      <label>
        {t.worker}
        <SearchSelect
          ariaLabel={t.worker} placeholder={t.typeToSearch} value={workerId} onChange={setWorkerId}
          options={workers.map((w) => ({ value: w._id, label: w.fatherName ? `${w.name} — ${w.fatherName}` : w.name, search: w.cnic || '' }))}
        />
      </label>
      <div className="wx-tabs" role="tablist">
        {[7, 15, 30].map((d) => (
          <button key={d} type="button" role="tab" aria-selected={days === d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>
            {d === 7 ? t.attWeek : d === 15 ? t.att15 : t.attMonth}
          </button>
        ))}
      </div>
      {workerId && (
        <>
          <div className="kpi-grid">
            <div className="stat" style={{ borderInlineStartColor: 'var(--ok-dark)' }}><span>{t.att_present}</span><strong className="ok">{n('present') + n('half') / 2}</strong></div>
            <div className="stat" style={{ borderInlineStartColor: 'var(--err-dark)' }}><span>{t.att_absent}</span><strong className="err">{n('absent')}</strong></div>
            <div className="stat" style={{ borderInlineStartColor: 'var(--warn-dark)' }}><span>{t.att_leave}</span><strong className="warn">{n('leave')}</strong></div>
            <div className="stat"><span>{t.attNotMarked}</span><strong>{list.filter((d) => !byDate[d]).length}</strong></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th className="sticky-col">{t.date}</th><th>{t.attStatus}</th></tr></thead>
              <tbody>
                {list.map((d) => (
                  <tr key={d}>
                    <td><strong>{fmtDate(d)}</strong> <span className="muted">{new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</span></td>
                    <td>{byDate[d] ? <span className={`badge att-badge att-${byDate[d]}`}>{t[`att_${byDate[d]}`]}</span> : <span className="muted">{t.attNotMarked}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
