import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, put, fmtDate, fmtDateTime, getRole } from '../api.js';
import DateTime from '../components/DateTime.jsx';
import RowActions, { useRowEdit } from '../components/RowActions.jsx';
import { Card, CardBody, Field, Input, MoneyInput, Button, Alert, Section, StatGrid, StatCard, Badge, TableCard, tbl, FilterInput, ClearFilters, Empty, toast, cx } from '../components/ui.jsx';

const EDIT_PATH = { payment: 'payments', expense: 'expenses', advance: 'advances' };
const today = () => new Date().toISOString().slice(0, 10);
const n = (v) => Number(v || 0).toLocaleString();
const has = (v, q) => !q || String(v ?? '').toLowerCase().includes(q.toLowerCase());

export default function CashBook() {
  const t = useT();
  const [date, setDate] = useState(today());
  const [book, setBook] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState({ text: '', bad: false });
  const editor = useRowEdit();
  // Today's entries can be corrected by staff; past days only by the owner.
  const canEdit = getRole() === 'owner' || date === today();

  const load = () => get(`/cashbook?date=${date}`).then(setBook).catch((e) => setErr(e.message));
  useEffect(() => { editor.stop(); load(); }, [date]);

  return (
    <div className="grid gap-4">
      <Card>
        <CardBody className="grid-cols-1 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-200">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-semibold text-n-500">{t.cashbook}</div>
              <strong className="text-lg text-n-900">{fmtDate(date)}</strong>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className="min-h-10" />
            <Button size="sm" variant="secondary" className="min-h-10" onClick={() => setDate(today())}>{t.day}</Button>
          </div>
        </CardBody>
      </Card>

      {err && <Alert tone="err">{err}</Alert>}
      {msg.text && <Alert tone={msg.bad ? 'err' : 'ok'}>{msg.text}</Alert>}

      {book && (
        <>
          <Card className="grid gap-4 p-4 sm:grid-cols-2">
            <Section title={t.groupInflows}>
              <StatGrid className="grid-cols-2 sm:grid-cols-2 lg:grid-cols-2">
                <StatCard label={t.openingCash} value={n(book.openingCash)} tone="blue" />
                <StatCard label={t.totalIn} value={`+${n(book.totalIn)}`} tone="green" />
              </StatGrid>
            </Section>
            <Section title={t.groupOutflows}>
              <StatGrid className="grid-cols-2 sm:grid-cols-2 lg:grid-cols-2">
                <StatCard label={t.totalOut} value={`-${n(book.totalOut)}`} tone="red" />
                <StatCard label={t.closingCash} value={n(book.closingCash)} tone="orange" />
              </StatGrid>
            </Section>
            <CashCount t={t} date={date} book={book} reload={load} />
          </Card>

          <CashTable t={t} title={t.incomeDetails} rows={book.income} sign="+" total={book.totalIn} editor={editor} canEdit={canEdit} setMsg={setMsg} reload={load} />
          <CashTable t={t} title={t.expenseDetails} rows={book.expense} sign="-" total={book.totalOut} editor={editor} canEdit={canEdit} setMsg={setMsg} reload={load} />
        </>
      )}
    </div>
  );
}

// One list of the day (money in, or money out); amount (and payee for expenses) edited in the row.
function CashTable({ t, title, rows, sign, total, editor, canEdit, setMsg, reload }) {
  const [f, setF] = useState({});
  const shown = rows.filter((r) => has(fmtDateTime(r.at), f.at) && has(r.name, f.name) && has(r.detail, f.detail) && has(r.amount, f.amount));
  const inn = sign === '+';
  return (
    <TableCard
      title={title}
      actions={(
        <div className="flex items-center gap-2">
          <ClearFilters show={Object.values(f).some(Boolean)} onClick={() => setF({})} label={t.clearAll} />
          <Badge tone={inn ? 'ok' : 'err'}>{sign}{n(total)}</Badge>
        </div>
      )}
    >
      <table className={tbl.table}>
        <thead>
          <tr>
            <th className={cx('rownum', tbl.th)}>#</th><th className={tbl.th}>{t.dateTime}</th><th className={cx('sticky-col', tbl.th)}>{t.name}</th>
            <th className={tbl.th}>{t.details}</th><th className={tbl.th}>{t.amount}</th><th className={cx('actions', tbl.th)}>{t.action}</th>
          </tr>
          <tr className="filter-row">
            <th className={cx('rownum', tbl.fth)} />
            {['at', 'name', 'detail', 'amount'].map((k) => (
              <th key={k} className={tbl.fth}><FilterInput aria-label={k} value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></th>
            ))}
            <th className={cx('actions', tbl.fth)} />
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => {
            const editing = editor.isEditing(r.id);
            return (
              <tr key={r.id || i} className={cx(tbl.tr, editing && 'bg-amber-50!')}>
                <td className={cx('rownum', tbl.td, 'text-n-500')}>{i + 1}</td>
                <td className={tbl.td}><DateTime value={r.at} /></td>
                <td className={cx(tbl.td, 'font-semibold')}>{editing && r.kind === 'expense' ? <input className={tbl.cell} {...editor.field('payee')} /> : r.name}</td>
                <td className={cx(tbl.td, 'min-w-40 whitespace-normal text-start')}>{r.detail}</td>
                <td className={cx(tbl.td, 'font-bold', inn ? 'text-gain' : 'text-loss')}>
                  {editing ? <input inputMode="decimal" className={tbl.cell} {...editor.field('amount')} /> : `${sign}${n(r.amount)}`}
                </td>
                <td className={cx('actions', tbl.td)}>
                  {r.id && (
                    <RowActions
                      editor={editor} id={r.id} path={`/${EDIT_PATH[r.kind]}/${r.id}`} name={r.name}
                      initial={r.kind === 'expense' ? { amount: String(r.amount), payee: r.name } : { amount: String(r.amount) }}
                      toPayload={(d) => (r.kind === 'expense' ? { amount: d.amount, payee: d.payee } : { amount: d.amount })}
                      canEdit={canEdit} canDelete={false}
                      onSaved={() => { setMsg({ text: t.savedOk, bad: false }); reload(); }}
                      onError={(m) => setMsg({ text: m, bad: true })}
                    />
                  )}
                </td>
              </tr>
            );
          })}
          {!shown.length && <Empty cols={6}>{t.noEntries}</Empty>}
        </tbody>
      </table>
    </TableCard>
  );
}

// count the cash in hand and compare with the book; a difference shows in red
function CashCount({ t, date, book, reload }) {
  const [v, setV] = useState('');
  useEffect(() => { setV(book.counted != null ? String(book.counted) : ''); }, [book.counted, date]);
  const diff = book.counted != null ? Number(book.counted) - Number(book.closingCash) : null;
  async function save() {
    try { await put('/cash-count', { date, amount: Number(v || 0) }); reload(); } catch (e) { toast(e.message, 'err'); }
  }
  return (
    <Section title={t.cashCount}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <Field label={t.cashCounted}><MoneyInput value={v} onChange={setV} /></Field>
        <Button onClick={save} disabled={v === ''}>{t.save}</Button>
      </div>
      {diff != null && (
        <p className={`m-0 rounded-md px-3 py-2 text-center text-md font-semibold ${Math.abs(diff) < 1 ? 'bg-green-50 text-gain' : 'bg-red-50 text-loss'}`}>
          {Math.abs(diff) < 1 ? t.cashMatches : `${t.cashDifference}: ${diff > 0 ? '+' : ''}${n(diff)}`}
        </p>
      )}
    </Section>
  );
}
