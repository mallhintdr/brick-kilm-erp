import { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n.js';
import { get, post, put, del, fmtDate } from '../api.js';
import { IconBtn } from '../components/RowActions.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const TYPES = ['borrowed', 'loanGiven', 'repaymentIn', 'repaymentOut', 'cashGiven', 'expense', 'income', 'other'];
// usual direction for each type (it can still be changed on the form)
const DIR = { borrowed: 'in', loanGiven: 'out', repaymentIn: 'in', repaymentOut: 'out', cashGiven: 'out', expense: 'out', income: 'in', other: 'out' };
const rs = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const blank = () => ({ date: today(), party: '', type: 'expense', direction: 'out', amount: '', note: '' });

// Running balance down a list in date order: + money in, - money out.
const withBalance = (rows) => {
  let bal = 0;
  return rows.map((r) => { bal += r.direction === 'in' ? r.amount : -r.amount; return { ...r, balance: bal }; });
};

// Owner's personal finances (borrowing, cash given, daily expenses...). Owner only.
export default function PersonalFinance() {
  const t = useT();
  const [rows, setRows] = useState([]);
  const [f, setF] = useState(blank());
  const [editId, setEditId] = useState(null);
  const [lf, setLf] = useState({});
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [rep, setRep] = useState({ from: today().slice(0, 8) + '01', to: today(), party: '' });
  const [report, setReport] = useState(null);

  const load = () => get('/personal').then(setRows).catch((e) => setMsg({ text: e.message, bad: true }));
  useEffect(() => { load(); }, []);
  const parties = useMemo(() => [...new Set(rows.map((r) => r.party))].sort(), [rows]);
  const typeText = (k) => t[`pf_${k}`] || k;

  async function submit(e) {
    e.preventDefault();
    try {
      const body = { ...f, amount: Number(f.amount) };
      if (editId) await put(`/personal/${editId}`, body); else await post('/personal', body);
      setMsg({ text: t.savedOk, bad: false });
      setF({ ...blank(), date: f.date });
      setEditId(null);
      load();
    } catch (e2) { setMsg({ text: e2.message, bad: true }); }
  }
  async function remove(r) {
    if (!window.confirm(`${t.confirmDelete}: ${r.party} — ${rs(r.amount)}?`)) return;
    try { await del(`/personal/${r._id}`); load(); } catch (e) { setMsg({ text: e.message, bad: true }); }
  }
  function startEdit(r) {
    setEditId(r._id);
    setF({ date: r.date, party: r.party, type: r.type, direction: r.direction, amount: String(r.amount), note: r.note || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // consolidated list: balance runs over every entry, newest shown first; filters narrow the view
  const listed = useMemo(() => withBalance(rows).reverse(), [rows]);
  const has = (v, q) => !q || String(v ?? '').toLowerCase().includes(q.toLowerCase());
  const shown = listed.filter((r) => has(fmtDate(r.date), lf.date) && has(r.party, lf.party) && has(typeText(r.type), lf.type) && has(r.note, lf.note)
    && (!lf.dir || r.direction === lf.dir));
  const total = (list, d) => list.filter((r) => r.direction === d).reduce((a, r) => a + r.amount, 0);
  const allIn = total(rows, 'in'); const allOut = total(rows, 'out');

  function makeReport() {
    const sel = rows.filter((r) => r.date >= rep.from && r.date <= rep.to && (!rep.party || r.party === rep.party));
    // opening balance = everything before the range for the same person (or all people)
    const before = rows.filter((r) => r.date < rep.from && (!rep.party || r.party === rep.party));
    const opening = total(before, 'in') - total(before, 'out');
    let bal = opening;
    const lines = sel.map((r) => { bal += r.direction === 'in' ? r.amount : -r.amount; return { ...r, balance: bal }; });
    setReport({ ...rep, opening, lines, tin: total(sel, 'in'), tout: total(sel, 'out'), closing: bal });
  }

  return (
    <div className="grid">
      <form className="card grid" onSubmit={submit}>
        <h2>{t.personalFinance}{editId ? ` — ${t.edit}` : ''}</h2>
        <div className="grid two">
          <label>{t.date}<input type="date" required max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
          <label>
            {t.pfParty}
            <input required list="pf-parties" value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })} placeholder={t.typeToSearch} />
            <datalist id="pf-parties">{parties.map((p) => <option key={p} value={p} />)}</datalist>
          </label>
          <label>
            {t.pfType}
            <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value, direction: DIR[e.target.value] })}>
              {TYPES.map((k) => <option key={k} value={k}>{typeText(k)}</option>)}
            </select>
          </label>
          <label>
            {t.pfDirection}
            <select value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}>
              <option value="in">{t.pfIn}</option>
              <option value="out">{t.pfOut}</option>
            </select>
          </label>
          <label>{t.amount}<input required inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, '') })} /></label>
        </div>
        <label>{t.pfNote}<textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        <div className="row" style={{ justifyContent: 'center', gap: '0.4rem' }}>
          <button className="primary fit-center">{editId ? t.save : <><span className="plus-icon" aria-hidden="true">+</span> {t.add}</>}</button>
          {editId && <button type="button" className="ghost" onClick={() => { setEditId(null); setF(blank()); }}>{t.cancel}</button>}
        </div>
        {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>{msg.text}</p>}
      </form>

      <div className="kpi-section">
        <div className="kpi-group">
          <h3 className="kpi-group-title">{t.pfSummary}</h3>
          <div className="kpi-grid">
            <div className="stat tone-teal"><span>{t.pfTotalIn}</span><strong className="ok">{rs(allIn)}</strong></div>
            <div className="stat tone-pink"><span>{t.pfTotalOut}</span><strong className="err">{rs(allOut)}</strong></div>
            <div className="stat"><span>{t.balance}</span><strong className={allIn - allOut < 0 ? 'err' : 'ok'}>{rs(allIn - allOut)}</strong></div>
          </div>
        </div>
      </div>

      <div className="card table-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem' }}>
          <h2 style={{ margin: 0, border: 'none', padding: 0 }}>{t.pfEntries} ({shown.length} / {rows.length})</h2>
          {Object.values(lf).some(Boolean) && <button type="button" className="clear-filter-btn" onClick={() => setLf({})}>✕ {t.clearAll}</button>}
        </div>
        <table>
          <thead>
            <tr>
              <th className="sticky-col">{t.date}</th><th>{t.pfParty}</th><th>{t.pfType}</th><th>{t.pfIn}</th><th>{t.pfOut}</th>
              <th>{t.balance}</th><th>{t.pfNote}</th><th className="actions">{t.action}</th>
            </tr>
            <tr className="filter-row">
              <th className="sticky-col"><input type="search" className="table-col-filter" aria-label={t.date} value={lf.date || ''} onChange={(e) => setLf({ ...lf, date: e.target.value })} /></th>
              <th><input type="search" className="table-col-filter" aria-label={t.pfParty} value={lf.party || ''} onChange={(e) => setLf({ ...lf, party: e.target.value })} /></th>
              <th><input type="search" className="table-col-filter" aria-label={t.pfType} value={lf.type || ''} onChange={(e) => setLf({ ...lf, type: e.target.value })} /></th>
              <th colSpan={2}>
                <select className="table-col-filter" aria-label={t.pfDirection} value={lf.dir || ''} onChange={(e) => setLf({ ...lf, dir: e.target.value })}>
                  <option value="">—</option><option value="in">{t.pfIn}</option><option value="out">{t.pfOut}</option>
                </select>
              </th>
              <th />
              <th><input type="search" className="table-col-filter" aria-label={t.pfNote} value={lf.note || ''} onChange={(e) => setLf({ ...lf, note: e.target.value })} /></th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r._id}>
                <td><strong>{fmtDate(r.date)}</strong></td>
                <td><strong>{r.party}</strong></td>
                <td>{typeText(r.type)}</td>
                <td className="ok">{r.direction === 'in' ? rs(r.amount) : ''}</td>
                <td className="err">{r.direction === 'out' ? rs(r.amount) : ''}</td>
                <td><strong className={r.balance < 0 ? 'err' : 'ok'}>{rs(r.balance)}</strong></td>
                <td className="issues-cell">{r.note || '—'}</td>
                <td className="actions"><div className="row-actions">
                  <IconBtn kind="edit" title={t.edit} onClick={() => startEdit(r)} />
                  <IconBtn kind="delete" title={t.delete} onClick={() => remove(r)} />
                </div></td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={8} className="muted">{t.noEntries}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card grid no-print">
        <h2>{t.pfReport}</h2>
        <div className="grid two">
          <label>{t.fromDate}<input type="date" value={rep.from} max={rep.to} onChange={(e) => setRep({ ...rep, from: e.target.value })} /></label>
          <label>{t.toDate}<input type="date" value={rep.to} min={rep.from} max={today()} onChange={(e) => setRep({ ...rep, to: e.target.value })} /></label>
          <label>
            {t.pfParty}
            <select value={rep.party} onChange={(e) => setRep({ ...rep, party: e.target.value })}>
              <option value="">{t.pfEveryone}</option>
              {parties.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
        <div className="row" style={{ justifyContent: 'center', gap: '0.4rem' }}>
          <button type="button" className="primary fit-center" onClick={makeReport}>{t.pfMakeReport}</button>
          {report && <button type="button" className="ghost" onClick={() => window.print()}>🖨 {t.print}</button>}
        </div>
      </div>

      {report && (
        <div className="card table-wrap pf-report">
          <h2>{t.pfReport}{report.party ? `: ${report.party}` : ''} — {fmtDate(report.from)} → {fmtDate(report.to)}</h2>
          <table>
            <thead><tr><th className="rownum">#</th><th>{t.date}</th><th>{t.pfParty}</th><th>{t.pfType}</th><th>{t.pfNote}</th><th>{t.pfIn}</th><th>{t.pfOut}</th><th>{t.balance}</th></tr></thead>
            <tbody>
              <tr><td className="rownum" /><td colSpan={6}><em>{t.pfOpening}</em></td><td><strong className={report.opening < 0 ? 'err' : 'ok'}>{rs(report.opening)}</strong></td></tr>
              {report.lines.map((r, i) => (
                <tr key={r._id}>
                  <td className="rownum">{i + 1}</td>
                  <td>{fmtDate(r.date)}</td><td>{r.party}</td><td>{typeText(r.type)}</td><td className="issues-cell">{r.note || ''}</td>
                  <td className="ok">{r.direction === 'in' ? rs(r.amount) : ''}</td>
                  <td className="err">{r.direction === 'out' ? rs(r.amount) : ''}</td>
                  <td><strong className={r.balance < 0 ? 'err' : 'ok'}>{rs(r.balance)}</strong></td>
                </tr>
              ))}
              {!report.lines.length && <tr><td colSpan={8} className="muted">{t.noEntries}</td></tr>}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}><strong>{t.total}</strong></td>
                <td className="ok"><strong>{rs(report.tin)}</strong></td>
                <td className="err"><strong>{rs(report.tout)}</strong></td>
                <td><strong className={report.closing < 0 ? 'err' : 'ok'}>{rs(report.closing)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
