import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, fmtDate } from '../api.js';
import SearchSelect from '../components/SearchSelect.jsx';
import { useTypes } from '../useTypes.js';

const rs = (n) => (n ? Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '');

// General ledger (khata) of one worker: every entry from day one, like the paper khata book.
export default function Khata() {
  const t = useT();
  const cats = useTypes('workerCategory');
  const [workers, setWorkers] = useState([]);
  const [workerId, setWorkerId] = useState('');
  const [khata, setKhata] = useState(null);
  const [err, setErr] = useState('');
  const [lf, setLf] = useState({});

  useEffect(() => { get('/workers').then((w) => setWorkers(w.sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {}); }, []);
  useEffect(() => {
    if (!workerId) { setKhata(null); return; }
    setErr('');
    get(`/khata/${workerId}`).then(setKhata).catch((e) => setErr(e.message));
  }, [workerId]);

  const has = (v, q) => !q || String(v ?? '').toLowerCase().includes(q.toLowerCase());
  const rows = (khata?.rows || []).filter((r) => has(fmtDate(r.at), lf.date) && has(r.detail, lf.detail) && has(r.naam, lf.naam) && has(r.jama, lf.jama));

  return (
    <div className="grid">
      <div className="card grid">
        <h2>{t.khataTitle}</h2>
        <label>
          {t.worker}
          <SearchSelect
            ariaLabel={t.worker} placeholder={t.typeToSearch} value={workerId} onChange={setWorkerId}
            options={workers.map((w) => ({
              value: w._id,
              label: `${w.fatherName ? `${w.name} — ${w.fatherName}` : w.name} (${cats.label(w.category)})`,
              search: `${w.cnic || ''} ${w.phone || ''}`,
            }))}
          />
        </label>
        {err && <p className="err" role="alert">{err}</p>}
      </div>

      {khata && (
        <>
          <div className="kpi-section">
            <div className="kpi-group">
              <h3 className="kpi-group-title">{t.khataOf} {khata.worker.name}{khata.worker.fatherName ? ` — ${khata.worker.fatherName}` : ''}</h3>
              <div className="kpi-grid">
                <div className="stat" style={{ borderInlineStartColor: 'var(--warn-dark)' }}><span>{t.naamGiven}</span><strong className="warn">{rs(khata.totals.naam) || 0}</strong></div>
                <div className="stat" style={{ borderInlineStartColor: 'var(--ok-dark)' }}><span>{t.jamaEarned}</span><strong className="ok">{rs(khata.totals.jama) || 0}</strong></div>
                <div className="stat" style={{ borderInlineStartColor: khata.totals.balance > 0 ? 'var(--err-dark)' : 'var(--ok-dark)' }}>
                  <span>{t.baqaya}</span><strong className={khata.totals.balance > 0 ? 'err' : 'ok'}>{rs(khata.totals.balance) || 0}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="card table-wrap">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem' }}>
              <h2 style={{ margin: 0, border: 'none', padding: 0 }}>{t.khataTitle} ({rows.length})</h2>
              {Object.values(lf).some(Boolean) && <button type="button" className="clear-filter-btn" onClick={() => setLf({})}>✕ {t.clearAll}</button>}
            </div>
            <table>
              <thead>
                <tr>
                  <th className="rownum">{t.serialNo}</th>
                  <th className="sticky-col">{t.date}</th>
                  <th>{t.details}</th>
                  <th>{t.naamRs}</th>
                  <th>{t.jamaRs}</th>
                  <th>{t.baqaya}</th>
                </tr>
                <tr className="filter-row">
                  <th className="rownum" />
                  {['date', 'detail', 'naam', 'jama'].map((k) => (
                    <th key={k} className={k === 'date' ? 'sticky-col' : undefined}>
                      <input type="search" className="table-col-filter" aria-label={k} value={lf[k] || ''} onChange={(e) => setLf({ ...lf, [k]: e.target.value })} />
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.no}>
                    <td className="rownum">{r.no}</td>
                    <td><strong>{fmtDate(r.at)}</strong></td>
                    <td className="issues-cell">{r.detail}</td>
                    <td className="warn">{rs(r.naam)}</td>
                    <td className="ok">{rs(r.jama)}</td>
                    <td><strong className={r.balance > 0 ? 'err' : 'ok'}>{rs(r.balance) || 0}</strong></td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={6} className="muted">{t.noEntries}</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
