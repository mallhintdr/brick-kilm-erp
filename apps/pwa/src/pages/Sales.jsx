import { useEffect, useState } from 'react';
import { useT, useLang } from '../i18n.js';
import { get, post, uuid, fmtDateTime } from '../api.js';
import DateTime from '../components/DateTime.jsx';
import SearchSelect from '../components/SearchSelect.jsx';
import { useTypes, typeLabel } from '../useTypes.js';
import RowActions, { useRowEdit } from '../components/RowActions.jsx';
import {
  Card, CardBody, Field, Input, Select, MoneyInput, FormGrid, Button, Alert, Section, StatGrid, StatCard, Tabs, Badge,
  TableCard, tbl, FilterInput, ClearFilters, Empty, cx,
} from '../components/ui.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const n = (v) => Number(v || 0).toLocaleString();
const has = (v, q) => !q || String(v ?? '').toLowerCase().includes(q.toLowerCase());

export default function Sales() {
  const t = useT();
  const { lang } = useLang();
  const custTypes = useTypes('customerType');
  const payModes = useTypes('paymentMode');
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [receivables, setReceivables] = useState(null);
  const [cf, setCf] = useState({ name: '', type: 'individual' });
  const [invf, setInvf] = useState({ customerId: '', grade: 'awwal', qty: '', taxPct: '0', date: today() });
  const [payf, setPayf] = useState({ invoiceId: '', amount: '', mode: 'cash', date: today() });
  const [msg, setMsg] = useState({ text: '', bad: false });
  const editor = useRowEdit();
  const [activeFormTab, setActiveFormTab] = useState('invoice');
  const [filters, setFilters] = useState({});
  // Unpaid-invoice picker on the payment tab: its own column filters
  const [payFilters, setPayFilters] = useState({});
  const pickInvoice = (inv) => setPayf((pf) => ({ ...pf, invoiceId: inv._id, amount: inv.balance ?? inv.amount }));

  const load = () => {
    get('/customers').then(setCustomers).catch(() => {});
    get('/invoices').then(setInvoices).catch(() => {});
    get('/receivables').then(setReceivables).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const run = async (e, fn) => {
    e.preventDefault();
    try { await fn(); load(); } catch (e2) { setMsg({ text: e2.message, bad: true }); }
  };
  const addCustomer = (e) => run(e, async () => {
    await post('/customers', { ...cf, clientUuid: uuid() });
    setCf({ name: '', type: 'individual' });
    setMsg({ text: t.savedOk, bad: false });
  });
  const addInvoice = (e) => run(e, async () => {
    const r = await post('/invoices', { ...invf, clientUuid: uuid() });
    setMsg({ text: r.queued ? t.queued : `${t.savedOk} — ${r.amount}`, bad: false });
    setInvf({ ...invf, qty: '' });
  });
  const addPayment = (e) => run(e, async () => {
    const r = await post('/payments', { ...payf, clientUuid: uuid() });
    setMsg({ text: r.queued ? t.queued : t.savedOk, bad: false });
    setPayf({ ...payf, amount: '' });
  });

  const customerName = (id) => customers.find((c) => c._id === id)?.name || '—';
  const gradeText = (g) => t[g] || g;
  const shownInvoices = invoices.filter((i) => has(fmtDateTime(i.date), filters.date) && has(customerName(i.customerId), filters.customer)
    && has(gradeText(i.grade), filters.grade) && has(i.qty, filters.qty) && has(i.amount, filters.amount) && has(i.status, filters.status));
  const unpaid = invoices.filter((i) => i.status !== 'paid').filter((i) => has(customerName(i.customerId), payFilters.customer)
    && has(fmtDateTime(i.date), payFilters.date) && has(`${i.grade} ${gradeText(i.grade)}`, payFilters.grade)
    && has(i.qty, payFilters.qty) && has(i.total ?? i.amount, payFilters.total) && has(i.paid, payFilters.paid) && has(i.balance, payFilters.balance));

  return (
    <div className="grid gap-4">
      {receivables && (
        <Card className="grid gap-4 p-4">
          <Section title={t.groupReceivablesTotal}>
            <StatGrid className="grid-cols-1 sm:grid-cols-1 lg:grid-cols-1">
              <StatCard label={t.totalReceivable} value={n(receivables.total)} tone={Number(receivables.total) > 0 ? 'amber' : 'green'} />
            </StatGrid>
          </Section>
          <Section title={t.groupAging}>
            <StatGrid className="sm:grid-cols-4 lg:grid-cols-4">
              {Object.entries(receivables.buckets).map(([bucket, amt]) => (
                <StatCard key={bucket} label={t.daysOverdue.replace('{n}', bucket)} value={n(amt)} tone={bucket === '90+' && Number(amt) > 0 ? 'red' : 'slate'} />
              ))}
            </StatGrid>
          </Section>
        </Card>
      )}

      <Card>
        <CardBody>
          <Tabs options={[['invoice', t.newInvoice], ['payment', t.recordPayment], ['customer', t.newCustomer]]} value={activeFormTab} onChange={setActiveFormTab} />

          {activeFormTab === 'invoice' && (
            <form className="grid gap-3" onSubmit={addInvoice}>
              <FormGrid className="lg:grid-cols-3">
                <Field label={t.customer} className="sm:col-span-2 lg:col-span-1">
                  <SearchSelect
                    required ariaLabel={t.customer} placeholder={t.typeToSearch} value={invf.customerId}
                    onChange={(v) => setInvf({ ...invf, customerId: v })}
                    options={customers.map((c) => ({ value: c._id, label: c.name, search: `${c.phone || ''} ${c.type || ''}` }))}
                  />
                </Field>
                <Field label={t.entryDate}><Input type="date" required max={today()} value={invf.date} onChange={(e) => setInvf({ ...invf, date: e.target.value })} /></Field>
                <Field label={t.grade}>
                  <Select value={invf.grade} onChange={(e) => setInvf({ ...invf, grade: e.target.value })}>
                    <option value="awwal">{t.awwal}</option><option value="doem">{t.doem}</option><option value="khangar">{t.khangar}</option>
                  </Select>
                </Field>
                <Field label={t.quantity}><Input required inputMode="numeric" placeholder={t.bricksUnitHint} value={invf.qty} onChange={(e) => setInvf({ ...invf, qty: e.target.value })} /></Field>
                <Field label={`${t.taxPct} (%)`}><Input inputMode="decimal" placeholder="0" value={invf.taxPct} onChange={(e) => setInvf({ ...invf, taxPct: e.target.value })} /></Field>
              </FormGrid>
              <Button type="submit" className="justify-self-center sm:min-w-48">＋ {t.newInvoice}</Button>
            </form>
          )}

          {activeFormTab === 'payment' && (
            <form className="grid gap-3" onSubmit={addPayment}>
              <div className="overflow-hidden rounded-lg ring-1 ring-n-200">
                <div className="flex items-center justify-between gap-2 bg-n-50 px-3 py-2">
                  <span className="text-sm font-semibold text-n-700">{t.invoice} — {t.unpaidInvoices}</span>
                  <ClearFilters show={Object.values(payFilters).some(Boolean)} onClick={() => setPayFilters({})} label={t.clearAll} />
                </div>
                {/* keeps "required" validation: a row must be picked */}
                <input className="pointer-events-none absolute h-px min-h-0 w-px border-0 p-0 opacity-0" tabIndex={-1} aria-hidden="true" required value={payf.invoiceId} onChange={() => {}} />
                <div className="table-wrap max-h-80 overflow-auto">
                  <table className={tbl.table}>
                    <thead>
                      <tr>
                        <th className={cx('rownum', tbl.th)} /><th className={cx('sticky-col', tbl.th)}>{t.customer}</th>
                        {[t.dateTime, t.grade, t.qty, t.total, t.paid, t.balanceDue].map((h) => <th key={h} className={tbl.th}>{h}</th>)}
                      </tr>
                      <tr className="filter-row">
                        <th className={cx('rownum', tbl.fth)} />
                        {['customer', 'date', 'grade', 'qty', 'total', 'paid', 'balance'].map((k) => (
                          <th key={k} className={tbl.fth}><FilterInput aria-label={k} value={payFilters[k] || ''} onChange={(e) => setPayFilters({ ...payFilters, [k]: e.target.value })} /></th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {unpaid.map((i) => {
                        const on = payf.invoiceId === i._id;
                        return (
                          <tr key={i._id} className={cx(tbl.tr, 'cursor-pointer', on && 'bg-amber-100!')} onClick={() => pickInvoice(i)} aria-selected={on}>
                            <td className={cx('rownum', tbl.td)}><input type="radio" name="payInvoice" className="size-4 min-h-0 accent-brand-600" checked={on} onChange={() => pickInvoice(i)} aria-label={customerName(i.customerId)} /></td>
                            <td className={cx(tbl.td, 'font-semibold')}>{customerName(i.customerId)}</td>
                            <td className={tbl.td}><DateTime value={i.date} /></td>
                            <td className={tbl.td}>{gradeText(i.grade)}</td>
                            <td className={tbl.td}>{n(i.qty)}</td>
                            <td className={tbl.td}>{n(i.total ?? i.amount)}</td>
                            <td className={tbl.td}>{n(i.paid)}</td>
                            <td className={cx(tbl.td, 'font-bold text-caution')}>{n(i.balance ?? i.amount)}</td>
                          </tr>
                        );
                      })}
                      {!unpaid.length && <Empty cols={8}>{t.noEntries}</Empty>}
                    </tbody>
                  </table>
                </div>
              </div>
              <FormGrid className="lg:grid-cols-3">
                <Field label={t.amount}><MoneyInput required value={payf.amount} onChange={(v) => setPayf({ ...payf, amount: v })} /></Field>
                <Field label={t.entryDate}><Input type="date" required max={today()} value={payf.date} onChange={(e) => setPayf({ ...payf, date: e.target.value })} /></Field>
                <Field label={t.mode}>
                  <Select value={payf.mode} onChange={(e) => setPayf({ ...payf, mode: e.target.value })}>
                    {payModes.active.map((m) => <option key={m.key} value={m.key}>{typeLabel(m, lang)}</option>)}
                  </Select>
                </Field>
              </FormGrid>
              <Button type="submit" className="justify-self-center sm:min-w-48">{t.recordPayment}</Button>
            </form>
          )}

          {activeFormTab === 'customer' && (
            <form className="grid gap-3" onSubmit={addCustomer}>
              <FormGrid>
                <Field label={t.name}><Input required value={cf.name} onChange={(e) => setCf({ ...cf, name: e.target.value })} /></Field>
                <Field label={t.customerType}>
                  <Select value={cf.type} onChange={(e) => setCf({ ...cf, type: e.target.value })}>
                    {custTypes.active.map((c) => <option key={c.key} value={c.key}>{typeLabel(c, lang)}</option>)}
                  </Select>
                </Field>
              </FormGrid>
              <Button type="submit" className="justify-self-center sm:min-w-48">＋ {t.add} {t.customer}</Button>
            </form>
          )}

          {msg.text && <Alert tone={msg.bad ? 'err' : 'ok'}>{msg.text}</Alert>}
        </CardBody>
      </Card>

      <TableCard
        title={`${t.sales} (${shownInvoices.length} / ${invoices.length})`}
        actions={<ClearFilters show={Object.values(filters).some(Boolean)} onClick={() => setFilters({})} label={t.clearAll} />}
      >
        <table className={tbl.table}>
          <thead>
            <tr>
              <th className={cx('rownum', tbl.th)}>#</th><th className={tbl.th}>{t.dateTime}</th><th className={cx('sticky-col', tbl.th)}>{t.customer}</th>
              {[t.grade, t.qty, t.amount, t.status].map((h) => <th key={h} className={tbl.th}>{h}</th>)}
              <th className={cx('actions', tbl.th)}>{t.action}</th>
            </tr>
            <tr className="filter-row">
              <th className={cx('rownum', tbl.fth)} />
              {['date', 'customer', 'grade', 'qty', 'amount', 'status'].map((k) => (
                <th key={k} className={tbl.fth}><FilterInput aria-label={k} value={filters[k] || ''} onChange={(e) => setFilters({ ...filters, [k]: e.target.value })} /></th>
              ))}
              <th className={cx('actions', tbl.fth)} />
            </tr>
          </thead>
          <tbody>
            {shownInvoices.map((i, idx) => {
              const editing = editor.isEditing(i._id);
              return (
                <tr key={i._id} className={cx(tbl.tr, editing && 'bg-amber-50!')}>
                  <td className={cx('rownum', tbl.td, 'text-n-500')}>{idx + 1}</td>
                  <td className={tbl.td}><DateTime value={i.date} /></td>
                  <td className={cx(tbl.td, 'font-semibold')}>{customerName(i.customerId)}</td>
                  <td className={tbl.td}><Badge>{gradeText(i.grade)}</Badge></td>
                  <td className={tbl.td}>{editing ? <input inputMode="numeric" className={tbl.cell} {...editor.field('qty')} /> : n(i.qty)}</td>
                  <td className={tbl.td}>{editing ? <input inputMode="decimal" className={tbl.cell} title={t.rate} {...editor.field('rate')} /> : <strong className="text-gain">{n(i.amount)}</strong>}</td>
                  <td className={tbl.td}>
                    {i.status === 'paid' ? <Badge tone="ok">✓ {t.paid}</Badge>
                      : Number(i.paid) > 0 ? <Badge tone="warn">{t.partPaid} — {t.balanceDue}: {n(i.balance)}</Badge>
                        : <Badge tone="warn">⏳ {t.open}</Badge>}
                  </td>
                  <td className={cx('actions', tbl.td)}>
                    <RowActions
                      editor={editor} id={i._id} path={`/invoices/${i._id}`} name={`${customerName(i.customerId)} — ${n(i.amount)}`}
                      initial={{ qty: String(i.qty), rate: String(i.rate) }}
                      toPayload={(d) => ({ qty: Number(d.qty), rate: d.rate })}
                      onSaved={() => { setMsg({ text: t.savedOk, bad: false }); load(); }}
                      onDeleted={() => { setMsg({ text: t.deleted, bad: false }); load(); }}
                      onError={(m) => setMsg({ text: m, bad: true })}
                    />
                  </td>
                </tr>
              );
            })}
            {!shownInvoices.length && <Empty cols={8}>{t.noEntries}</Empty>}
          </tbody>
        </table>
      </TableCard>
    </div>
  );
}
