import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n.js';
import { get, post, uuid, getRole, fmtDateTime } from '../api.js';
import DateTime from '../components/DateTime.jsx';
import SearchSelect from '../components/SearchSelect.jsx';
import {
  Card, CardHeader, CardBody, Field, Input, MoneyInput, FormGrid, Button, Alert, Badge, TableCard, tbl, FilterInput, ClearFilters, Empty, cx,
} from '../components/ui.jsx';
import { ArrowDownToLine, HandCoins, Printer } from 'lucide-react';

export default function Peshgi() {
  const t = useT();
  const [workers, setWorkers] = useState([]);
  const [workerId, setWorkerId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [balance, setBalance] = useState(null);
  const [entries, setEntries] = useState([]);
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState({});

  useEffect(() => {
    get('/workers').then((w) => {
      setWorkers(w);
      if (w[0]) setWorkerId(w[0]._id);
    }).catch(() => {});
  }, []);

  const refresh = () => {
    if (!workerId) return;
    get(`/workers/${workerId}/peshgi`).then((r) => setBalance(r.outstanding)).catch(() => setBalance(null));
    get(`/workers/${workerId}/ledger`).then(setEntries).catch(() => setEntries([]));
  };
  useEffect(() => { refresh(); }, [workerId]);

  async function submit(path) {
    setMsg({ text: '', bad: false });
    setSubmitting(true);
    try {
      const body = { workerId, amount, date: entryDate, clientUuid: uuid() };
      if (path === '/advances' && reason) body.overrideReason = reason;
      const r = await post(path, body);
      setMsg({ text: r.queued ? t.queued : t.savedOk, bad: false });
      setAmount('');
      refresh();
    } catch (e) {
      setMsg({ text: e.message, bad: true });
    } finally {
      setSubmitting(false);
    }
  }

  const selectedWorker = workers.find((w) => w._id === workerId);
  const accountText = (e) => (e.account === 'peshgi' ? t.peshgi : t.earnings);
  const amountOf = (e) => Number(e.debit) || Number(e.credit) || '';
  const has = (v, q) => !q || String(v ?? '').toLowerCase().includes(q.toLowerCase());
  const shown = entries.filter((e) => has(fmtDateTime(e.createdAt), filters.date) && has(accountText(e), filters.account)
    && has(e.type, filters.type) && has(amountOf(e), filters.amount));

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title={t.peshgi} />
        <CardBody>
          <Field label={t.worker}>
            <SearchSelect
              ariaLabel={t.worker} placeholder={t.typeToSearch} value={workerId} onChange={setWorkerId}
              options={workers.map((w) => ({
                value: w._id,
                label: w.fatherName ? `${w.name} — ${w.fatherName}` : w.name,
                search: `${w.cnic || ''} ${w.category || ''} ${w.phone || ''}`,
              }))}
            />
          </Field>

          {/* the worker's balance and slip */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-brand-50 px-4 py-3 ring-1 ring-brand-200">
            <div>
              <div className="text-xs font-semibold text-n-600">{t.outstanding}{selectedWorker ? ` — ${selectedWorker.name}` : ''}</div>
              <div className={cx('text-2xl font-extrabold tabular-nums', Number(balance) > 0 ? 'text-brand-700' : 'text-gain')}>
                {balance !== null ? Number(balance).toLocaleString() : '—'}
              </div>
            </div>
            {workerId && (
              <Link className="inline-flex min-h-10 items-center rounded-lg bg-white px-3.5 text-sm font-semibold text-n-700 no-underline ring-1 ring-n-300 hover:bg-n-50"
                to={`/print/worker/${workerId}`} target="_blank" rel="noopener"><Printer className="size-4 shrink-0" aria-hidden="true" /> {t.printSlip}</Link>
            )}
          </div>

          <FormGrid className="lg:grid-cols-3">
            <Field label={t.entryDate}><Input type="date" required max={new Date().toISOString().slice(0, 10)} value={entryDate} onChange={(e) => setEntryDate(e.target.value)} /></Field>
            <Field label={`${t.amount} (Rs)`}><MoneyInput placeholder="5,000" value={amount} onChange={setAmount} /></Field>
            {getRole() === 'owner' && <Field label={t.reason}><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
          </FormGrid>

          <div className="grid grid-cols-2 gap-2">
            <Button disabled={!workerId || !amount || submitting} onClick={() => submit('/advances')}><HandCoins className="size-4 shrink-0" aria-hidden="true" /> {t.advance}</Button>
            <Button className="bg-gain hover:bg-green-800" disabled={!workerId || !amount || submitting} onClick={() => submit('/recoveries')}><ArrowDownToLine className="size-4 shrink-0" aria-hidden="true" /> {t.recovery}</Button>
          </div>
          {msg.text && <Alert tone={msg.bad ? 'err' : 'ok'}>{msg.text}</Alert>}
        </CardBody>
      </Card>

      <TableCard
        title={`${t.ledgerHistory} (${shown.length} / ${entries.length})`}
        actions={<ClearFilters show={Object.values(filters).some(Boolean)} onClick={() => setFilters({})} label={t.clearAll} />}
      >
        <table className={tbl.table}>
          <thead>
            <tr>
              <th className={cx('rownum', tbl.th)}>#</th><th className={tbl.th}>{t.dateTime}</th><th className={cx('sticky-col', tbl.th)}>{t.account}</th>
              <th className={tbl.th}>{t.type}</th><th className={tbl.th}>{t.amount}</th>
            </tr>
            <tr className="filter-row">
              <th className={cx('rownum', tbl.fth)} />
              {['date', 'account', 'type', 'amount'].map((k) => (
                <th key={k} className={tbl.fth}><FilterInput aria-label={k} value={filters[k] || ''} onChange={(e) => setFilters({ ...filters, [k]: e.target.value })} /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((e, i) => (
              <tr key={e._id} className={tbl.tr}>
                <td className={cx('rownum', tbl.td, 'text-n-500')}>{i + 1}</td>
                <td className={tbl.td}><DateTime value={e.createdAt} /></td>
                <td className={cx(tbl.td, 'font-semibold')}>{accountText(e)}</td>
                <td className={tbl.td}><Badge>{e.type}{e.reversesId ? ` (${t.reversal})` : ''}</Badge></td>
                <td className={cx(tbl.td, 'font-bold', Number(e.debit) > 0 ? 'text-gain' : 'text-loss')}>
                  {Number(e.debit) > 0 ? `+${Number(e.debit).toLocaleString()}` : `-${Number(e.credit).toLocaleString()}`}
                </td>
              </tr>
            ))}
            {!shown.length && <Empty cols={5}>{t.noEntries}</Empty>}
          </tbody>
        </table>
      </TableCard>
    </div>
  );
}
