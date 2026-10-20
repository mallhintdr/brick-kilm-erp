import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n.js';
import { get, post, put, del, fmtDate } from '../api.js';
import { IconBtn } from '../components/RowActions.jsx';
import {
  Card, CardHeader, CardBody, Field, Input, Select, Textarea, MoneyInput, FormGrid, Button, Alert, Section, StatGrid, StatCard, Tabs,
  TableCard, tbl, FilterInput, ClearFilters, Empty, cx, AmountHint, fmtMoney, unfmtMoney,
} from '../components/ui.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const TYPES = ['borrowed', 'loanGiven', 'repaymentIn', 'repaymentOut', 'cashGiven', 'expense', 'income', 'other'];
// usual direction for each type (it can still be changed)
const DIR = { borrowed: 'in', loanGiven: 'out', repaymentIn: 'in', repaymentOut: 'out', cashGiven: 'out', expense: 'out', income: 'in', other: 'out' };
const MODES = ['cash', 'account', 'jazzcash', 'easypaisa', 'other'];
const rs = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const blank = () => ({ date: today(), party: '', type: 'expense', direction: 'out', amount: '', mode: 'cash', note: '' });
const sum = (list, d) => list.filter((r) => r.direction === d).reduce((a, r) => a + r.amount, 0);
const signed = (r) => (r.direction === 'in' ? r.amount : -r.amount);
const balCls = (v) => (v < 0 ? 'text-loss' : 'text-gain');

// Name box that shows matching earlier names while typing (tap one to pick it).
function NameBox({ value, onChange, names, t, required, compact }) {
  const [open, setOpen] = useState(false);
  const matches = names.filter((n) => !value || n.toLowerCase().includes(value.toLowerCase())).slice(0, 8);
  const props = {
    required, value, placeholder: t.typeToSearch,
    onChange: (e) => { onChange(e.target.value); setOpen(true); }, onFocus: () => setOpen(true), onBlur: () => setTimeout(() => setOpen(false), 150),
  };
  return (
    <span className="relative block w-full">
      {compact ? <input className={tbl.cell} {...props} /> : <Input {...props} />}
      {open && matches.length > 0 && !(matches.length === 1 && matches[0] === value) && (
        <ul className="absolute inset-x-0 top-full z-30 m-0 mt-1 max-h-56 list-none overflow-y-auto rounded-lg bg-white p-1 shadow-lg ring-1 ring-n-200" role="listbox">
          {matches.map((n) => (
            <li key={n} role="option" aria-selected={n === value} onMouseDown={() => { onChange(n); setOpen(false); }}
              className="cursor-pointer rounded-md px-3 py-2 text-md text-n-900 hover:bg-brand-50">{n}</li>
          ))}
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
    <div className="grid gap-4">
      <Tabs size="sm" className="no-print" value={view} onChange={(k) => { setMsg({ text: '', bad: false }); setView(k); }}
        options={[['home', t.home], ['add', t.pfAddNew], ['list', t.pfAllEntries], ['report', t.pfGenReport]]} />
      {msg.text && <Alert tone={msg.bad ? 'err' : 'ok'}>{msg.text}</Alert>}
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
    <Card className="grid gap-4 p-4">
      <Section title={t.pfSummary}>
        <StatGrid className="sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label={t.pfTotalIn} value={rs(allIn)} tone="green" />
          <StatCard label={t.pfTotalOut} value={rs(allOut)} tone="red" />
          <StatCard label={t.balance} value={rs(allIn - allOut)} tone={allIn - allOut < 0 ? 'red' : 'teal'} />
          <StatCard label={t.pfEntries} value={rows.length} tone="blue" />
          <StatCard label={t.pfPeople} value={parties.length} tone="violet" />
        </StatGrid>
      </Section>
      <Section title={t.pfPersonSummary}>
        <Select value={person} onChange={(e) => setPerson(e.target.value)} aria-label={t.pfName}>
          <option value="">— {t.pfChoosePerson} —</option>
          {parties.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        {person && (
          <StatGrid className="sm:grid-cols-4 lg:grid-cols-4">
            <StatCard label={t.pfTotalIn} value={rs(pIn)} tone="green" />
            <StatCard label={t.pfTotalOut} value={rs(pOut)} tone="red" />
            <StatCard label={t.balance} value={rs(pIn - pOut)} tone={pIn - pOut < 0 ? 'red' : 'teal'} />
            <StatCard label={t.pfLastEntry} value={pRows.length ? fmtDate(pRows[pRows.length - 1].date) : '—'} tone="blue" />
          </StatGrid>
        )}
      </Section>
    </Card>
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
    <Card>
      <CardHeader title={t.pfAddEntry} />
      <form onSubmit={submit}>
        <CardBody>
          <FormGrid className="lg:grid-cols-3">
            <Field label={t.date}><Input type="date" required max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label={t.pfName}><NameBox required value={f.party} onChange={(v) => setF({ ...f, party: v })} names={parties} t={t} /></Field>
            <Field label={t.pfType}>
              <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value, direction: DIR[e.target.value] })}>
                {TYPES.map((k) => <option key={k} value={k}>{typeText(k)}</option>)}
              </Select>
            </Field>
            <Field label={t.pfDirection}>
              <Tabs options={[['in', t.pfIn], ['out', t.pfOut]]} value={f.direction} onChange={(v) => setF({ ...f, direction: v })} className="min-h-11 items-stretch" />
            </Field>
            <Field label={t.amount}><MoneyInput required value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
            <Field label={t.pfMode}>
              <Select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
                {MODES.map((m) => <option key={m} value={m}>{t[`pm_${m}`]}</option>)}
              </Select>
            </Field>
          </FormGrid>
          <Field label={t.pfNote}><Textarea rows={2} className="min-h-16" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          <Button type="submit" className="justify-self-center sm:min-w-40">＋ {t.add}</Button>
        </CardBody>
      </form>
    </Card>
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
  const fsel = (k, opts, label) => (
    <select className={tbl.filter} aria-label={label} value={lf[k] || ''} onChange={(e) => setLf({ ...lf, [k]: e.target.value })}>
      <option value="">—</option>{opts}
    </select>
  );

  return (
    <TableCard
      title={`${t.pfEntries} (${shown.length} / ${rows.length})`}
      actions={<ClearFilters show={Object.values(lf).some(Boolean)} onClick={() => setLf({})} label={t.clearAll} />}
    >
      <table className={tbl.table}>
        <thead>
          <tr>
            <th className={cx('sticky-col', tbl.th)}>{t.date}</th>
            {[t.pfName, t.pfType, t.pfMode, t.pfIn, t.pfOut, t.balance, t.pfNote].map((h) => <th key={h} className={tbl.th}>{h}</th>)}
            <th className={cx('actions', tbl.th)}>{t.action}</th>
          </tr>
          <tr className="filter-row">
            <th className={cx('sticky-col', tbl.fth)}><FilterInput aria-label={t.date} value={lf.date || ''} onChange={(e) => setLf({ ...lf, date: e.target.value })} /></th>
            <th className={tbl.fth}>{fsel('party', parties.map((p) => <option key={p} value={p}>{p}</option>), t.pfName)}</th>
            <th className={tbl.fth}><FilterInput aria-label={t.pfType} value={lf.type || ''} onChange={(e) => setLf({ ...lf, type: e.target.value })} /></th>
            <th className={tbl.fth}>{fsel('mode', MODES.map((m) => <option key={m} value={m}>{t[`pm_${m}`]}</option>), t.pfMode)}</th>
            <th colSpan={2} className={tbl.fth}>{fsel('dir', [<option key="in" value="in">{t.pfIn}</option>, <option key="out" value="out">{t.pfOut}</option>], t.pfDirection)}</th>
            <th className={tbl.fth} />
            <th className={tbl.fth}><FilterInput aria-label={t.pfNote} value={lf.note || ''} onChange={(e) => setLf({ ...lf, note: e.target.value })} /></th>
            <th className={tbl.fth} />
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            if (edit?._id === r._id) {
              return (
                <tr key={r._id} ref={editRow} className="bg-amber-50 *:bg-inherit">
                  <td className={tbl.td}><input type="date" className={tbl.cell} max={today()} {...E('date')} /></td>
                  <td className={tbl.td}><NameBox compact value={edit.party} onChange={(v) => setEdit({ ...edit, party: v })} names={parties} t={t} /></td>
                  <td className={tbl.td}><select className={tbl.cell} value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value, direction: DIR[e.target.value] })}>{TYPES.map((k) => <option key={k} value={k}>{typeText(k)}</option>)}</select></td>
                  <td className={tbl.td}><select className={tbl.cell} {...E('mode')}>{MODES.map((m) => <option key={m} value={m}>{t[`pm_${m}`]}</option>)}</select></td>
                  <td colSpan={2} className={tbl.td}>
                    <div className="grid gap-1">
                      <select className={tbl.cell} {...E('direction')}><option value="in">{t.pfIn}</option><option value="out">{t.pfOut}</option></select>
                      <input inputMode="decimal" className={tbl.cell} value={fmtMoney(edit.amount)} onChange={(e) => setEdit({ ...edit, amount: unfmtMoney(e.target.value) })} />
                      <AmountHint value={edit.amount} />
                    </div>
                  </td>
                  <td className={tbl.td}>—</td>
                  <td className={tbl.td}><input className={tbl.cell} {...E('note')} /></td>
                  <td className={cx('actions', tbl.td)}>
                    <div className="inline-flex gap-1.5">
                      <IconBtn kind="save" title={t.save} onClick={save} />
                      <IconBtn kind="cancel" title={t.cancel} onClick={() => setEdit(null)} />
                    </div>
                  </td>
                </tr>
              );
            }
            return (
              <tr key={r._id} className={cx(tbl.tr, r.edited && 'bg-orange-50!')} title={r.edited ? t.pfWasEdited : undefined}>
                <td className={cx('sticky-col', tbl.td, 'font-semibold')}>{fmtDate(r.date)}</td>
                <td className={cx(tbl.td, 'font-semibold')}>{r.party}</td>
                <td className={tbl.td}>{typeText(r.type)}</td>
                <td className={tbl.td}>{modeText(r.mode)}</td>
                <td className={cx(tbl.td, 'text-gain')}>{r.direction === 'in' ? rs(r.amount) : ''}</td>
                <td className={cx(tbl.td, 'text-loss')}>{r.direction === 'out' ? rs(r.amount) : ''}</td>
                <td className={cx(tbl.td, 'font-bold', balCls(r.balance))}>{rs(r.balance)}</td>
                <td className={cx(tbl.td, 'min-w-40 whitespace-normal text-start')}>
                  {r.note || '—'}{r.edited ? <span className="ms-1 text-xs font-semibold text-brand-700">✎ {t.pfEdited}</span> : null}
                </td>
                <td className={cx('actions', tbl.td)}>
                  <div className="inline-flex gap-1.5">
                    <IconBtn kind="edit" title={t.edit} onClick={() => setEdit({ ...r, amount: String(r.amount), mode: r.mode || 'cash', note: r.note || '' })} />
                    <IconBtn kind="delete" title={t.delete} onClick={() => remove(r)} />
                  </div>
                </td>
              </tr>
            );
          })}
          {!shown.length && <Empty cols={9}>{t.noEntries}</Empty>}
        </tbody>
      </table>
    </TableCard>
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
      <Card className="no-print">
        <CardHeader title={t.pfReport} />
        <CardBody>
          <FormGrid className="lg:grid-cols-3">
            <Field label={t.fromDate}><Input type="date" value={rep.from} max={rep.to} onChange={(e) => setRep({ ...rep, from: e.target.value })} /></Field>
            <Field label={t.toDate}><Input type="date" value={rep.to} min={rep.from} max={today()} onChange={(e) => setRep({ ...rep, to: e.target.value })} /></Field>
            <Field label={t.pfName}>
              <Select value={rep.party} onChange={(e) => setRep({ ...rep, party: e.target.value })}>
                <option value="">{t.pfEveryone}</option>
                {parties.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
          </FormGrid>
          {!rep.party && (
            <label className="flex items-center justify-center gap-2 text-md font-medium text-n-700">
              <input type="checkbox" className="size-5 min-h-0 accent-brand-600" checked={rep.net} onChange={(e) => setRep({ ...rep, net: e.target.checked })} />
              {t.pfNetCombined}
            </label>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={make}>{t.pfMakeReport}</Button>
            {report && <Button variant="secondary" onClick={exportPdf}>⬇ {t.pfExportPdf}</Button>}
          </div>
        </CardBody>
      </Card>

      {report && (
        <Card className="print-area overflow-hidden">
          <div className="pf-report-head flex flex-nowrap justify-between gap-4 whitespace-nowrap border-b border-n-200 px-4 py-2.5 text-md">
            <span><b>{t.pfName}:</b> {report.party || (report.net ? `${t.pfEveryone} (${t.pfNet})` : t.pfEveryone)}</span>
            <span><b>{t.date}:</b> {fmtDate(report.from)} {t.to} {fmtDate(report.to)}</span>
          </div>
          <div className="table-wrap overflow-x-auto">
            <table className={tbl.table}>
              <thead><tr>{['#', t.date, t.pfName, t.pfType, t.pfMode, t.pfNote, t.pfIn, t.pfOut, t.balance].map((h, i) => <th key={i} className={cx(i === 0 && 'rownum', tbl.th)}>{h}</th>)}</tr></thead>
              <tbody>
                <tr className="bg-n-50">
                  <td className={cx('rownum', tbl.td)} /><td colSpan={7} className={cx(tbl.td, 'text-start italic')}>{t.pfOpening}</td>
                  <td className={cx(tbl.td, 'font-bold', balCls(report.opening))}>{rs(report.opening)}</td>
                </tr>
                {report.lines.map((r, i) => (
                  <tr key={r._id} className={tbl.tr}>
                    <td className={cx('rownum', tbl.td, 'text-n-500')}>{i + 1}</td>
                    <td className={tbl.td}>{fmtDate(r.date)}</td><td className={tbl.td}>{r.party}</td><td className={tbl.td}>{typeText(r.type)}</td>
                    <td className={tbl.td}>{modeText(r.mode)}</td><td className={cx(tbl.td, 'whitespace-normal text-start')}>{r.note || ''}</td>
                    <td className={cx(tbl.td, 'text-gain')}>{r.direction === 'in' ? rs(r.amount) : ''}</td>
                    <td className={cx(tbl.td, 'text-loss')}>{r.direction === 'out' ? rs(r.amount) : ''}</td>
                    <td className={cx(tbl.td, 'font-bold', balCls(r.balance))}>{rs(r.balance)}</td>
                  </tr>
                ))}
                {!report.lines.length && <Empty cols={9}>{t.noEntries}</Empty>}
              </tbody>
              <tfoot>
                <tr className="bg-n-100 font-bold">
                  <td colSpan={6} className={tbl.td}>{t.total}</td>
                  <td className={cx(tbl.td, 'text-gain')}>{rs(report.tin)}</td>
                  <td className={cx(tbl.td, 'text-loss')}>{rs(report.tout)}</td>
                  <td className={cx(tbl.td, balCls(report.closing))}>{rs(report.closing)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
