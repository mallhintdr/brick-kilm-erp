import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT, useLang } from '../i18n.js';
import { get, post, del, uuid, getRole } from '../api.js';
import SearchSelect from '../components/SearchSelect.jsx';
import DateTime from '../components/DateTime.jsx';
import { IconBtn } from '../components/RowActions.jsx';
import { useTypes, typeLabel } from '../useTypes.js';
import {
  Card, CardHeader, CardBody, Field, Input, Select, MoneyInput, FormGrid, Button, Alert, Muted, Badge, TableCard, tbl, Empty, cx,
} from '../components/ui.jsx';
import { Calculator, Plus, Printer, Save } from 'lucide-react';

const isoDaysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const n = (v) => Number(v || 0).toLocaleString();

export default function Kharchi() {
  const t = useT();
  const { lang } = useLang();
  const cats = useTypes('workerCategory');
  const [category, setCategory] = useState('pathera');
  const [periodStart, setPeriodStart] = useState(isoDaysAgo(7));
  const [periodEnd, setPeriodEnd] = useState(isoDaysAgo(0));
  const [proposal, setProposal] = useState(null);
  const [runs, setRuns] = useState([]);
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [busy, setBusy] = useState(false);

  const loadRuns = () => get('/kharchi-runs').then(setRuns).catch(() => {});
  useEffect(() => { loadRuns(); }, []);

  // ---- daily (dasti) kharcha: cash a worker takes during the week ----
  const [workers, setWorkers] = useState([]);
  const [kf, setKf] = useState({ category: 'pathera', workerId: '', amount: '', date: isoDaysAgo(0) });
  const [entries, setEntries] = useState([]);
  const [kMsg, setKMsg] = useState({ text: '', bad: false });
  useEffect(() => { get('/workers').then(setWorkers).catch(() => {}); }, []);
  const loadEntries = () => get(`/kharcha?from=${periodStart}&to=${periodEnd}`).then(setEntries).catch(() => setEntries([]));
  useEffect(() => { loadEntries(); }, [periodStart, periodEnd]);
  const workersOf = workers.filter((w) => w.category === kf.category && w.status !== 'inactive');
  const catOptions = cats.active.map((c) => <option key={c.key} value={c.key}>{typeLabel(c, lang)}</option>);

  async function addKharcha(e) {
    e.preventDefault();
    setKMsg({ text: '', bad: false });
    try {
      const r = await post('/kharcha', { workerId: kf.workerId, amount: kf.amount, date: kf.date, clientUuid: uuid() });
      setKMsg({ text: r.queued ? t.queued : t.savedOk, bad: false });
      setKf({ ...kf, workerId: '', amount: '' });
      loadEntries();
    } catch (e2) { setKMsg({ text: e2.message, bad: true }); }
  }
  async function removeKharcha(id) {
    if (!window.confirm(t.confirmDelete)) return;
    try { await del(`/kharcha/${id}`); loadEntries(); } catch (e2) { setKMsg({ text: e2.message, bad: true }); }
  }

  async function propose() {
    setMsg({ text: '', bad: false });
    setProposal(null);
    try {
      const qs = new URLSearchParams({ periodStart, periodEnd, category }).toString();
      const r = await get(`/kharchi-runs/propose?${qs}`);
      setProposal(r);
      if (!r.items.length) setMsg({ text: t.noEntries, bad: false });
    } catch (e) { setMsg({ text: e.message, bad: true }); }
  }

  function editKharchi(workerId, value) {
    setProposal((p) => ({
      ...p,
      items: p.items.map((it) => (it.workerId === workerId ? { ...it, kharchi: value, recovery: (Number(it.gross) - Number(value || 0)).toFixed(2) } : it)),
    }));
  }

  async function settle() {
    setBusy(true);
    try {
      const r = await post('/kharchi-runs', {
        periodStart, periodEnd, category,
        items: proposal.items.map((it) => ({ workerId: it.workerId, gross: it.gross, kharchi: it.kharchi })),
        clientUuid: uuid(),
      });
      setMsg({ text: r.queued ? t.queued : `${t.savedOk} — ${t.totalOut}: ${r.totalKharchi}`, bad: false });
      setProposal(null);
      loadRuns();
    } catch (e) { setMsg({ text: e.message, bad: true }); }
    setBusy(false);
  }

  const sum = (k) => proposal?.items.reduce((a, it) => a + Number(it[k] || 0), 0) ?? 0;
  const totalKharchi = sum('kharchi');
  const num = 'text-end';

  return (
    <div className="grid gap-4">
      {/* Daily kharcha entry */}
      <Card>
        <CardHeader title={t.dailyKharcha} />
        <form onSubmit={addKharcha}>
          <CardBody>
            <FormGrid>
              <Field label={t.category}>
                <Select value={kf.category} onChange={(e) => setKf({ ...kf, category: e.target.value, workerId: '' })}>{catOptions}</Select>
              </Field>
              <Field label={t.name}>
                <SearchSelect
                  required ariaLabel={t.name} placeholder={t.typeToSearch} value={kf.workerId}
                  onChange={(v) => setKf({ ...kf, workerId: v })}
                  options={workersOf.map((w) => ({ value: w._id, label: w.fatherName ? `${w.name} — ${w.fatherName}` : w.name, search: w.cnic || '' }))}
                />
              </Field>
              <Field label={t.amount}><MoneyInput required value={kf.amount} onChange={(v) => setKf({ ...kf, amount: v })} /></Field>
              <Field label={t.entryDate}><Input type="date" required max={isoDaysAgo(0)} value={kf.date} onChange={(e) => setKf({ ...kf, date: e.target.value })} /></Field>
            </FormGrid>
            {!workersOf.length && <Muted>{t.noWorkersInCategory}</Muted>}
            <Button type="submit" disabled={!kf.workerId || !kf.amount} className="justify-self-center sm:min-w-40"><Plus className="size-4 shrink-0" aria-hidden="true" /> {t.add}</Button>
            {kMsg.text && <Alert tone={kMsg.bad ? 'err' : 'ok'}>{kMsg.text}</Alert>}
          </CardBody>
        </form>
      </Card>

      <TableCard title={`${t.kharchaTaken} (${entries.length}) — ${n(entries.reduce((a, r) => a + Number(r.amount || 0), 0))}`}>
        <table className={tbl.table}>
          <thead>
            <tr>
              <th className={cx('rownum', tbl.th)}>#</th><th className={tbl.th}>{t.dateTime}</th><th className={cx('sticky-col', tbl.th)}>{t.name}</th>
              <th className={tbl.th}>{t.category}</th><th className={tbl.th}>{t.amount}</th><th className={cx('actions', tbl.th)}>{t.action}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((r, i) => (
              <tr key={r._id} className={tbl.tr}>
                <td className={cx('rownum', tbl.td, 'text-n-500')}>{i + 1}</td>
                <td className={tbl.td}><DateTime value={r.date} /></td>
                <td className={cx(tbl.td, 'font-semibold')}>{r.name}</td>
                <td className={tbl.td}>{cats.label(r.category)}</td>
                <td className={cx(tbl.td, 'font-bold')}>{n(r.amount)}</td>
                <td className={cx('actions', tbl.td)}>{getRole() === 'owner' && <IconBtn kind="delete" title={t.delete} onClick={() => removeKharcha(r._id)} />}</td>
              </tr>
            ))}
            {!entries.length && <Empty cols={6}>{t.noEntries}</Empty>}
          </tbody>
        </table>
      </TableCard>

      {/* Weekly settlement */}
      <Card>
        <CardHeader title={t.kharchiRun} />
        <CardBody>
          <FormGrid className="lg:grid-cols-3">
            <Field label={t.category}><Select value={category} onChange={(e) => setCategory(e.target.value)}>{catOptions}</Select></Field>
            <Field label={t.periodStart}><Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></Field>
            <Field label={t.periodEnd}><Input type="date" value={periodEnd} max={isoDaysAgo(0)} onChange={(e) => setPeriodEnd(e.target.value)} /></Field>
          </FormGrid>
          <Button data-tour="propose" onClick={propose} className="justify-self-center sm:min-w-48"><Calculator className="size-4 shrink-0" aria-hidden="true" /> {t.propose}</Button>
          {msg.text && <Alert tone={msg.bad ? 'err' : 'ok'}>{msg.text}</Alert>}
        </CardBody>
      </Card>

      {proposal && proposal.items.length > 0 && (
        <Card className="overflow-hidden ring-2 ring-brand-300">
          <CardHeader title={t.propose}>
            <span className="rounded-md bg-n-100 px-2.5 py-1 text-xs text-n-600">
              {proposal.cutMode ? t.cutFormula.replace('{c}', proposal.cutPerThousand) : t.kharchiFormula.replace('{r}', proposal.recoveryPct).replace('{f}', proposal.kharchiFloor)}
            </span>
          </CardHeader>
          <div className="table-wrap overflow-x-auto">
            <table className={tbl.table}>
              <thead>
                <tr>
                  <th className={cx('rownum', tbl.th)}>#</th><th className={cx('sticky-col', tbl.th)}>{t.name}</th>
                  {[t.bricksDone, `${t.amount} (${t.gross})`, t.recovery, t.kharchiPaid, t.kharchaTaken, t.balanceToPay].map((h) => <th key={h} className={tbl.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {proposal.items.map((it, i) => {
                  const toPay = Number(it.kharchi || 0) - Number(it.taken || 0);
                  return (
                    <tr key={it.workerId} className={tbl.tr}>
                      <td className={cx('rownum', tbl.td, 'text-n-500')}>{i + 1}</td>
                      <td className={cx(tbl.td, 'font-semibold')}>{it.name}</td>
                      <td className={cx(tbl.td, num)}>{n(it.bricks)}</td>
                      <td className={cx(tbl.td, num)}>{n(it.gross)}</td>
                      <td className={cx(tbl.td, num, 'font-bold text-caution')}>{n(it.recovery)}</td>
                      <td className={tbl.td}><input inputMode="decimal" className={cx(tbl.cell, 'max-w-32 text-end font-bold')} value={it.kharchi} onChange={(e) => editKharchi(it.workerId, e.target.value)} /></td>
                      <td className={cx(tbl.td, num)}>{n(it.taken)}</td>
                      <td className={cx(tbl.td, num, 'font-bold', toPay < 0 ? 'text-loss' : 'text-gain')}>{n(toPay)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-n-100 font-bold">
                  <td colSpan={2} className={tbl.td}>{t.total}</td>
                  <td className={cx(tbl.td, num)}>{n(sum('bricks'))}</td>
                  <td className={cx(tbl.td, num)}>{n(sum('gross'))}</td>
                  <td className={cx(tbl.td, num, 'text-caution')}>{n(sum('recovery'))}</td>
                  <td className={cx(tbl.td, num, 'text-gain')}>{n(totalKharchi)}</td>
                  <td className={cx(tbl.td, num)}>{n(sum('taken'))}</td>
                  <td className={cx(tbl.td, num)}>{n(totalKharchi - sum('taken'))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="p-4"><Button block loading={busy} onClick={settle}><Save className="size-4 shrink-0" aria-hidden="true" /> {t.saveAndSettle}</Button></div>
        </Card>
      )}

      <TableCard title={`${t.recentRuns} (${runs.length})`}>
        <table className={tbl.table}>
          <thead>
            <tr>
              <th className={cx('rownum', tbl.th)}>#</th><th className={tbl.th}>{t.dateTime}</th><th className={tbl.th}>{t.category}</th>
              <th className={cx('sticky-col', tbl.th)}>{t.workers}</th><th className={tbl.th}>{t.totalOut}</th><th className={cx('actions', tbl.th)}>{t.action}</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => (
              <tr key={r._id} className={tbl.tr}>
                <td className={cx('rownum', tbl.td, 'text-n-500')}>{i + 1}</td>
                <td className={tbl.td}><DateTime value={r.createdAt} /></td>
                <td className={tbl.td}><Badge>{cats.label(r.category)}</Badge></td>
                <td className={tbl.td}>{r.items?.length || '—'}</td>
                <td className={cx(tbl.td, num, 'font-bold text-gain')}>{n(r.totalKharchi)}</td>
                <td className={cx('actions', tbl.td)}>
                  <Link className="inline-flex min-h-8 items-center rounded-md bg-white px-2.5 text-xs font-semibold text-n-700 no-underline ring-1 ring-n-300 hover:bg-n-50"
                    to={`/print/kharchi/${r._id}`} target="_blank" rel="noopener"><Printer className="size-4 shrink-0" aria-hidden="true" /> {t.printSlip}</Link>
                </td>
              </tr>
            ))}
            {!runs.length && <Empty cols={6}>{t.noEntries}</Empty>}
          </tbody>
        </table>
      </TableCard>
    </div>
  );
}
