import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n.js';
import { get, post, put, del, fmtDate } from '../api.js';
import { IconBtn } from '../components/RowActions.jsx';
import AmountHint, { fmtMoney, unfmtMoney } from '../components/AmountHint.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const TYPES = ['borrowed', 'loanGiven', 'repaymentIn', 'repaymentOut', 'cashGiven', 'expense', 'income', 'other'];
// usual direction for each type (it can still be changed)
const DIR = { borrowed: 'in', loanGiven: 'out', repaymentIn: 'in', repaymentOut: 'out', cashGiven: 'out', expense: 'out', income: 'in', other: 'out' };
const MODES = ['cash', 'account', 'jazzcash', 'easypaisa', 'other'];
const rs = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const blank = () => ({ date: today(), party: '', type: 'expense', direction: 'out', amount: '', mode: 'cash', note: '' });
const sum = (list, d) => list.filter((r) => r.direction === d).reduce((a, r) => a + r.amount, 0);
const signed = (r) => (r.direction === 'in' ? r.amount : -r.amount);

// Name box that shows matching earlier names while typing (tap one to pick it).
function NameBox({ value, onChange, names, t, required, compact }) {
  const [open, setOpen] = useState(false);
  const matches = names.filter((n) => !value || n.toLowerCase().includes(value.toLowerCase())).slice(0, 8);
  return (
    <span className="pf-name">
      <input required={required} value={value} placeholder={t.typeToSearch} className={compact ? 'cell-input' : undefined}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && matches.length > 0 && !(matches.length === 1 && matches[0] === value) && (
        <ul className="pf-name-list" role="listbox">
          {matches.map((n) => <li key={n} role="option" aria-selected={n === value} onMouseDown={() => { onChange(n); setOpen(false); }}>{n}</li>)}
        </ul>
      )}
    </span>
  );
}

// Owner's personal finances (borrowing, cash given, daily expenses...). Owner only.
export default function PersonalFinance() {
  const t = useT();
  const [view, setView] = useState('home'); // home | add | list | report
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState({ text: '', bad: false });
  const load = () => get('/personal').then(setRows).catch((e) => setMsg({ text: e.message, bad: true }));
  useEffect(() => { load(); }, []);
  const parties = useMemo(() => [...new Set(rows.map((r) => r.party))].sort((a, b) => a.localeCompare(b)), [rows]);
  const typeText = (k) => t[`pf_${k}`] || k;
  const modeText = (m) => t[`pm_${m || 'cash'}`];

  return (
    <div className="grid pf">
      <div className="pf-nav no-print" role="tablist">
        {[['home', t.home], ['add', t.pfAddNew], ['list', t.pfAllEntries], ['report', t.pfGenReport]].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => { setMsg({ text: '', bad: false }); setView(k); }}>{label}</button>
        ))}
      </div>
      {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>{msg.text}</p>}
      {view === 'home' && <PfHome t={t} rows={rows} parties={parties} />}
      {view === 'add' && <PfAdd t={t} parties={parties} typeText={typeText} onSaved={() => { setMsg({ text: t.savedOk, bad: false }); load(); }} onError={(m) => setMsg({ text: m, bad: true })} />}
      {view === 'list' && <PfList t={t} rows={rows} parties={parties} typeText={typeText} modeText={modeText} reload={load} setMsg={setMsg} />}
      {view === 'report' && <PfReport t={t} rows={rows} parties={parties} typeText={typeText} modeText={modeText} />}
    </div>
  );
}

// ---- Home: totals over everything, and one person's summary from the dropdown ----
function PfHome({ t, rows, parties }) {
  const [person, setPerson] = useState('');
  const pRows = rows.filter((r) => r.party === person);
  const allIn = sum(rows, 'in'); const allOut = sum(rows, 'out');
  const pIn = sum(pRows, 'in'); const pOut = sum(pRows, 'out');
  return (
    <>
      <div className="kpi-section">
        <div className="kpi-group">
          <h3 className="kpi-group-title">{t.pfSummary}</h3>
          <div className="kpi-grid">
            <div className="stat tone-teal"><span>{t.pfTotalIn}</span><strong className="ok">{rs(allIn)}</strong></div>
            <div className="stat tone-pink"><span>{t.pfTotalOut}</span><strong className="err">{rs(allOut)}</strong></div>
            <div className="stat"><span>{t.balance}</span><strong className={allIn - allOut < 0 ? 'err' : 'ok'}>{rs(allIn - allOut)}</strong></div>
            <div className="stat tone-blue"><span>{t.pfEntries}</span><strong>{rows.length}</strong></div>
            <div className="stat tone-violet"><span>{t.pfPeople}</span><strong>{parties.length}</strong></div>
          </div>
        </div>
        <div className="kpi-group">
          <h3 className="kpi-group-title">{t.pfPersonSummary}</h3>
          <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label={t.pfName}>
            <option value="">— {t.pfChoosePerson} —</option>
            {parties.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          {person && (
            <div className="kpi-grid">
              <div className="stat tone-teal"><span>{t.pfTotalIn}</span><strong className="ok">{rs(pIn)}</strong></div>
              <div className="stat tone-pink"><span>{t.pfTotalOut}</span><strong className="err">{rs(pOut)}</strong></div>
              <div className="stat"><span>{t.balance}</span><strong className={pIn - pOut < 0 ? 'err' : 'ok'}>{rs(pIn - pOut)}</strong></div>
              <div className="stat tone-blue"><span>{t.pfLastEntry}</span><strong>{pRows.length ? fmtDate(pRows[pRows.length - 1].date) : '—'}</strong></div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---- Add ----
function PfAdd({ t, parties, typeText, onSaved, onError }) {
  const [f, setF] = useState(blank());
  async function submit(e) {
    e.preventDefault();
    try {
      await post('/personal', { ...f, amount: Number(f.amount) });
      setF({ ...blank(), date: f.date });
      onSaved();
    } catch (e2) { onError(e2.message); }
  }
  return (
    <form className="card grid pf-form" onSubmit={submit}>
      <h2>{t.pfAddEntry}</h2>
      <div className="grid two">
        <label>{t.date}<input type="date" required max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label>{t.pfName}<NameBox required value={f.party} onChange={(v) => setF({ ...f, party: v })} names={parties} t={t} /></label>
        <label>
          {t.pfType}
          <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value, direction: DIR[e.target.value] })}>
            {TYPES.map((k) => <option key={k} value={k}>{typeText(k)}</option>)}
          </select>
        </label>
        <label>
          {t.pfDirection}
          <select value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}>
            <option value="in">{t.pfIn}</option><option value="out">{t.pfOut}</option>
          </select>
        </label>
        <label>{t.amount}<input required inputMode="decimal" value={fmtMoney(f.amount)} onChange={(e) => setF({ ...f, amount: unfmtMoney(e.target.value) })} /><AmountHint value={f.amount} /></label>
        <label>
          {t.pfMode}
          <select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
            {MODES.map((m) => <option key={m} value={m}>{t[`pm_${m}`]}</option>)}
          </select>
        </label>
      </div>
      <label>{t.pfNote}<textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      <button className="primary fit-center"><span className="plus-icon" aria-hidden="true">+</span> {t.add}</button>
    </form>
  );
}

// ---- List: date order, each person's own running balance, edit in the row ----
function PfList({ t, rows, parties, typeText, modeText, reload, setMsg }) {
  const [lf, setLf] = useState({});
  const [edit, setEdit] = useState(null);
  const editRow = useRef(null);
  useEffect(() => { if (edit) editRow.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [edit?._id]);

  const listed = useMemo(() => {
    const bal = {};
    return rows.map((r) => { bal[r.party] = (bal[r.party] || 0) + signed(r); return { ...r, balance: bal[r.party] }; });
  }, [rows]);
  const has = (v, q) => !q || String(v ?? '').toLowerCase().includes(q.toLowerCase());
  const shown = listed.filter((r) => has(fmtDate(r.date), lf.date) && (!lf.party || r.party === lf.party) && has(typeText(r.type), lf.type)
    && has(r.note, lf.note) && (!lf.dir || r.direction === lf.dir) && (!lf.mode || (r.mode || 'cash') === lf.mode));

  async function save() {
    try {
      await put(`/personal/${edit._id}`, { date: edit.date, party: edit.party, type: edit.type, direction: edit.direction, amount: Number(edit.amount), mode: edit.mode, note: edit.note });
      setEdit(null); setMsg({ text: t.savedOk, bad: false }); reload();
    } catch (e) { setMsg({ text: e.message, bad: true }); }
  }
  async function remove(r) {
    if (!window.confirm(`${t.confirmDelete}: ${r.party} — ${rs(r.amount)}?`)) return;
    try { await del(`/personal/${r._id}`); reload(); } catch (e) { setMsg({ text: e.message, bad: true }); }
  }
  const E = (k) => ({ value: edit[k] ?? '', onChange: (e) => setEdit({ ...edit, [k]: e.target.value }) });

  return (
    <div className="card table-wrap pf-list">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem' }}>
        <h2 style={{ margin: 0, border: 'none', padding: 0 }}>{t.pfEntries} ({shown.length} / {rows.length})</h2>
        {Object.values(lf).some(Boolean) && <button type="button" className="clear-filter-btn" onClick={() => setLf({})}>✕ {t.clearAll}</button>}
      </div>
      <table>
        <thead>
          <tr>
            <th className="sticky-col">{t.date}</th><th>{t.pfName}</th><th>{t.pfType}</th><th>{t.pfMode}</th>
            <th>{t.pfIn}</th><th>{t.pfOut}</th><th>{t.balance}</th><th>{t.pfNote}</th><th className="actions">{t.action}</th>
          </tr>
          <tr className="filter-row">
            <th className="sticky-col"><input type="search" className="table-col-filter" aria-label={t.date} value={lf.date || ''} onChange={(e) => setLf({ ...lf, date: e.target.value })} /></th>
            <th>
              <select className="table-col-filter" aria-label={t.pfName} value={lf.party || ''} onChange={(e) => setLf({ ...lf, party: e.target.value })}>
                <option value="">—</option>{parties.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </th>
            <th><input type="search" className="table-col-filter" aria-label={t.pfType} value={lf.type || ''} onChange={(e) => setLf({ ...lf, type: e.target.value })} /></th>
            <th>
              <select className="table-col-filter" aria-label={t.pfMode} value={lf.mode || ''} onChange={(e) => setLf({ ...lf, mode: e.target.value })}>
                <option value="">—</option>{MODES.map((m) => <option key={m} value={m}>{t[`pm_${m}`]}</option>)}
              </select>
            </th>
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
          {shown.map((r) => {
            if (edit?._id === r._id) {
              return (
                <tr key={r._id} ref={editRow} className="pf-editing">
                  <td><input type="date" className="cell-input" max={today()} {...E('date')} /></td>
                  <td><NameBox compact value={edit.party} onChange={(v) => setEdit({ ...edit, party: v })} names={parties} t={t} /></td>
                  <td><select className="cell-input" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value, direction: DIR[e.target.value] })}>{TYPES.map((k) => <option key={k} value={k}>{typeText(k)}</option>)}</select></td>
                  <td><select className="cell-input" {...E('mode')}>{MODES.map((m) => <option key={m} value={m}>{t[`pm_${m}`]}</option>)}</select></td>
                  <td colSpan={2}>
                    <select className="cell-input" {...E('direction')}><option value="in">{t.pfIn}</option><option value="out">{t.pfOut}</option></select>
                    <input inputMode="decimal" className="cell-input" value={fmtMoney(edit.amount)} onChange={(e) => setEdit({ ...edit, amount: unfmtMoney(e.target.value) })} />
                    <AmountHint value={edit.amount} />
                  </td>
                  <td>—</td>
                  <td><input className="cell-input" {...E('note')} /></td>
                  <td className="actions"><div className="row-actions">
                    <IconBtn kind="save" title={t.save} onClick={save} />
                    <IconBtn kind="cancel" title={t.cancel} onClick={() => setEdit(null)} />
                  </div></td>
                </tr>
              );
            }
            return (
              <tr key={r._id} className={r.edited ? 'pf-edited' : undefined} title={r.edited ? t.pfWasEdited : undefined}>
                <td className="sticky-col"><strong>{fmtDate(r.date)}</strong></td>
                <td><strong>{r.party}</strong></td>
                <td>{typeText(r.type)}</td>
                <td>{modeText(r.mode)}</td>
                <td className="ok">{r.direction === 'in' ? rs(r.amount) : ''}</td>
                <td className="err">{r.direction === 'out' ? rs(r.amount) : ''}</td>
                <td><strong className={r.balance < 0 ? 'err' : 'ok'}>{rs(r.balance)}</strong></td>
                <td className="issues-cell">{r.note || '—'}{r.edited ? <span className="pf-edited-tag"> ✎ {t.pfEdited}</span> : null}</td>
                <td className="actions"><div className="row-actions">
                  <IconBtn kind="edit" title={t.edit} onClick={() => setEdit({ ...r, amount: String(r.amount), mode: r.mode || 'cash', note: r.note || '' })} />
                  <IconBtn kind="delete" title={t.delete} onClick={() => remove(r)} />
                </div></td>
              </tr>
            );
          })}
          {!shown.length && <tr><td colSpan={9} className="muted">{t.noEntries}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ---- Report: one person or everyone (each person's own balance, or net of all), print / PDF ----
function PfReport({ t, rows, parties, typeText, modeText }) {
  const [rep, setRep] = useState({ from: `${today().slice(0, 8)}01`, to: today(), party: '', net: false });
  const [report, setReport] = useState(null);
  function make() {
    const inParty = (r) => !rep.party || r.party === rep.party;
    const sel = rows.filter((r) => r.date >= rep.from && r.date <= rep.to && inParty(r));
    const before = rows.filter((r) => r.date < rep.from && inParty(r));
    const net = rep.party ? true : rep.net; // one person, or everyone combined
    let lines;
    let opening;
    if (net) {
      opening = sum(before, 'in') - sum(before, 'out');
      let bal = opening;
      lines = sel.map((r) => { bal += signed(r); return { ...r, balance: bal }; });
    } else {
      // everyone, each with their own running balance carried in from before the range
      const bal = {};
      for (const r of before) bal[r.party] = (bal[r.party] || 0) + signed(r);
      opening = Object.values(bal).reduce((a, v) => a + v, 0);
      lines = sel.map((r) => { bal[r.party] = (bal[r.party] || 0) + signed(r); return { ...r, balance: bal[r.party] }; });
    }
    const tin = sum(sel, 'in'); const tout = sum(sel, 'out');
    setReport({ ...rep, net, opening, lines, tin, tout, closing: opening + tin - tout });
  }
  // Export PDF: the print dialog with "Save as PDF"; only the report prints, landscape, fitted to the page.
  const exportPdf = () => {
    document.body.classList.add('printing-pf');
    setTimeout(() => { window.print(); setTimeout(() => document.body.classList.remove('printing-pf'), 500); }, 50);
  };

  return (
    <>
      <div className="card grid no-print">
        <h2>{t.pfReport}</h2>
        <div className="grid two">
          <label>{t.fromDate}<input type="date" value={rep.from} max={rep.to} onChange={(e) => setRep({ ...rep, from: e.target.value })} /></label>
          <label>{t.toDate}<input type="date" value={rep.to} min={rep.from} max={today()} onChange={(e) => setRep({ ...rep, to: e.target.value })} /></label>
          <label>
            {t.pfName}
            <select value={rep.party} onChange={(e) => setRep({ ...rep, party: e.target.value })}>
              <option value="">{t.pfEveryone}</option>
              {parties.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
        {!rep.party && (
          <label className="row pf-net" style={{ alignItems: 'center', justifyContent: 'center' }}>
            <input type="checkbox" checked={rep.net} onChange={(e) => setRep({ ...rep, net: e.target.checked })} style={{ width: 'auto', minHeight: 'auto' }} />
            {t.pfNetCombined}
          </label>
        )}
        <div className="row" style={{ justifyContent: 'center', gap: '0.4rem' }}>
          <button type="button" className="primary fit-center" onClick={make}>{t.pfMakeReport}</button>
          {report && <button type="button" className="ghost" onClick={exportPdf}>⬇ {t.pfExportPdf}</button>}
        </div>
      </div>

      {report && (
        <div className="card table-wrap pf-report print-area">
          <div className="pf-report-head">
            <span><b>{t.pfName}:</b> {report.party || (report.net ? `${t.pfEveryone} (${t.pfNet})` : t.pfEveryone)}</span>
            <span><b>{t.date}:</b> {fmtDate(report.from)} {t.to} {fmtDate(report.to)}</span>
          </div>
          <table>
            <thead><tr><th className="rownum">#</th><th>{t.date}</th><th>{t.pfName}</th><th>{t.pfType}</th><th>{t.pfMode}</th><th>{t.pfNote}</th><th>{t.pfIn}</th><th>{t.pfOut}</th><th>{t.balance}</th></tr></thead>
            <tbody>
              <tr><td className="rownum" /><td colSpan={7}><em>{t.pfOpening}</em></td><td><strong className={report.opening < 0 ? 'err' : 'ok'}>{rs(report.opening)}</strong></td></tr>
              {report.lines.map((r, i) => (
                <tr key={r._id}>
                  <td className="rownum">{i + 1}</td>
                  <td>{fmtDate(r.date)}</td><td>{r.party}</td><td>{typeText(r.type)}</td><td>{modeText(r.mode)}</td><td className="issues-cell">{r.note || ''}</td>
                  <td className="ok">{r.direction === 'in' ? rs(r.amount) : ''}</td>
                  <td className="err">{r.direction === 'out' ? rs(r.amount) : ''}</td>
                  <td><strong className={r.balance < 0 ? 'err' : 'ok'}>{rs(r.balance)}</strong></td>
                </tr>
              ))}
              {!report.lines.length && <tr><td colSpan={9} className="muted">{t.noEntries}</td></tr>}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6}><strong>{t.total}</strong></td>
                <td className="ok"><strong>{rs(report.tin)}</strong></td>
                <td className="err"><strong>{rs(report.tout)}</strong></td>
                <td><strong className={report.closing < 0 ? 'err' : 'ok'}>{rs(report.closing)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
