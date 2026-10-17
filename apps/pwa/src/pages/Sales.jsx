import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, post, uuid, fmtDateTime } from '../api.js';
import AmountHint, { fmtMoney, unfmtMoney } from '../components/AmountHint.jsx';
import DateTime from '../components/DateTime.jsx';
import SearchSelect from '../components/SearchSelect.jsx';
import { useTypes, typeLabel } from '../useTypes.js';
import RowActions, { useRowEdit } from '../components/RowActions.jsx';
import { useLang } from '../i18n.js';

export default function Sales() {
  const t = useT();
  const { lang } = useLang();
  const custTypes = useTypes('customerType');
  const payModes = useTypes('paymentMode');
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [receivables, setReceivables] = useState(null);
  const [cf, setCf] = useState({ name: '', type: 'individual' });
  const [invf, setInvf] = useState({ customerId: '', grade: 'awwal', qty: '', taxPct: '0', date: new Date().toISOString().slice(0, 10) });
  const [payf, setPayf] = useState({ invoiceId: '', amount: '', mode: 'cash', date: new Date().toISOString().slice(0, 10) });
  const [msg, setMsg] = useState({ text: '', bad: false });
  const editor = useRowEdit();
  const [activeFormTab, setActiveFormTab] = useState('invoice');
  const [filters, setFilters] = useState({});
  const updateFilter = (k, v) => setFilters((prev) => ({ ...prev, [k]: v }));
  const clearFilters = () => setFilters({});
  const hasActiveFilters = Object.values(filters).some(Boolean);
  // Unpaid-invoice picker on the payment tab: its own column filters
  const [payFilters, setPayFilters] = useState({});
  const setPayFilter = (k, v) => setPayFilters((prev) => ({ ...prev, [k]: v }));
  const pickInvoice = (inv) => setPayf((pf) => ({ ...pf, invoiceId: inv._id, amount: inv.balance ?? inv.amount }));

  const load = () => {
    get('/customers').then(setCustomers).catch(() => {});
    get('/invoices').then(setInvoices).catch(() => {});
    get('/payments').then(setPayments).catch(() => {});
    get('/receivables').then(setReceivables).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  async function addCustomer(e) {
    e.preventDefault();
    try {
      await post('/customers', { ...cf, clientUuid: uuid() });
      setCf({ name: '', type: 'individual' });
      setMsg({ text: t.savedOk, bad: false });
      load();
    } catch (e2) { setMsg({ text: e2.message, bad: true }); }
  }

  async function addInvoice(e) {
    e.preventDefault();
    try {
      const r = await post('/invoices', { ...invf, clientUuid: uuid() });
      setMsg({ text: r.queued ? t.queued : `${t.savedOk} — ${r.amount}`, bad: false });
      setInvf({ ...invf, qty: '' });
      load();
    } catch (e2) { setMsg({ text: e2.message, bad: true }); }
  }

  async function addPayment(e) {
    e.preventDefault();
    try {
      const r = await post('/payments', { ...payf, clientUuid: uuid() });
      setMsg({ text: r.queued ? t.queued : t.savedOk, bad: false });
      setPayf({ ...payf, amount: '' });
      load();
    } catch (e2) { setMsg({ text: e2.message, bad: true }); }
  }

  const afterDelete = () => { setMsg({ text: t.deleted, bad: false }); load(); };
  const onDelError = (m) => setMsg({ text: m, bad: true });
  const customerName = (id) => customers.find((c) => c._id === id)?.name || '—';

  return (
    <div className="grid">
      {/* Grouped Receivables Aging KPIs */}
      {receivables && (
        <div className="kpi-section">
          <div className="kpi-group">
            <h3 className="kpi-group-title">
              {t.groupReceivablesTotal}
            </h3>
            <div className="kpi-grid">
              <div className="stat" style={{ borderInlineStartColor: Number(receivables.total) > 0 ? 'var(--warn-dark)' : 'var(--ok-dark)' }}>
                <span>{t.totalReceivable}</span>
                <strong className={Number(receivables.total) > 0 ? 'warn' : 'ok'}>
                  {Number(receivables.total).toLocaleString()}
                </strong>
              </div>
            </div>
          </div>

          <div className="kpi-group">
            <h3 className="kpi-group-title">
              {t.groupAging}
            </h3>
            <div className="kpi-grid">
              {Object.entries(receivables.buckets).map(([bucket, amt]) => (
                <div
                  className="stat"
                  key={bucket}
                  style={{ borderInlineStartColor: bucket === '90+' && Number(amt) > 0 ? 'var(--err-dark)' : 'var(--line)' }}
                >
                  <span>{t.daysOverdue.replace('{n}', bucket)}</span>
                  <strong className={bucket === '90+' && Number(amt) > 0 ? 'err' : ''}>
                    {Number(amt).toLocaleString()}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action Tabs for Sales Operations */}
      <div className="card grid">
        <div style={{ display: 'flex', gap: '0.4rem', borderBottom: '1.5px solid var(--line)', paddingBottom: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={activeFormTab === 'invoice' ? 'primary' : 'ghost'}
            onClick={() => setActiveFormTab('invoice')}
          >
            {t.newInvoice}
          </button>
          <button
            type="button"
            className={activeFormTab === 'payment' ? 'primary' : 'ghost'}
            onClick={() => setActiveFormTab('payment')}
          >
            {t.recordPayment}
          </button>
          <button
            type="button"
            className={activeFormTab === 'customer' ? 'primary' : 'ghost'}
            onClick={() => setActiveFormTab('customer')}
          >
            {t.newCustomer}
          </button>
        </div>

        {activeFormTab === 'invoice' && (
          <form className="grid" onSubmit={addInvoice}>
            <div className="grid two" style={{ gap: '0.85rem' }}>
              <label>
                {t.customer}
                <SearchSelect
                  required ariaLabel={t.customer} placeholder={t.typeToSearch} value={invf.customerId}
                  onChange={(v) => setInvf({ ...invf, customerId: v })}
                  options={customers.map((c) => ({ value: c._id, label: c.name, search: `${c.phone || ''} ${c.type || ''}` }))}
                />
              </label>
              <label>
                {t.entryDate}
                <input type="date" required max={new Date().toISOString().slice(0, 10)} value={invf.date} onChange={(e) => setInvf({ ...invf, date: e.target.value })} />
              </label>
              <label>
                {t.grade}
                <select value={invf.grade} onChange={(e) => setInvf({ ...invf, grade: e.target.value })}>
                  <option value="awwal">{t.awwal}</option>
                  <option value="doem">{t.doem}</option>
                  <option value="khangar">{t.khangar}</option>
                </select>
              </label>
              <label>
                {t.quantity}
                <input required inputMode="numeric" placeholder={t.bricksUnitHint} value={invf.qty} onChange={(e) => setInvf({ ...invf, qty: e.target.value })} />
              </label>
              <label>
                {t.taxPct} (%)
                <input inputMode="decimal" placeholder="0" value={invf.taxPct} onChange={(e) => setInvf({ ...invf, taxPct: e.target.value })} />
              </label>
            </div>
            <button className="primary" style={{ marginTop: '0.35rem' }}>
              Create {t.newInvoice}
            </button>
          </form>
        )}

        {activeFormTab === 'payment' && (
          <form className="grid" onSubmit={addPayment}>
            <div className="grid two" style={{ gap: '0.85rem' }}>
              <div className="pay-picker" style={{ gridColumn: '1 / -1' }}>
                <div className="pay-picker-title">
                  <span>{t.invoice} — {t.unpaidInvoices}</span>
                  {Object.values(payFilters).some(Boolean) && (
                    <button type="button" className="clear-filter-btn" onClick={() => setPayFilters({})}>✕ {t.clearAll}</button>
                  )}
                </div>
                {/* keeps "required" validation: a row must be picked */}
                <input className="search-select-guard" tabIndex={-1} aria-hidden="true" required value={payf.invoiceId} onChange={() => {}} />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th className="rownum" />
                        <th className="sticky-col">{t.customer}</th>
                        <th>{t.dateTime}</th>
                        <th>{t.grade}</th>
                        <th>{t.qty}</th>
                        <th>{t.total}</th>
                        <th>{t.paid}</th>
                        <th>{t.balanceDue}</th>
                      </tr>
                      <tr className="filter-row">
                        <th className="rownum" />
                        {['customer', 'date', 'grade', 'qty', 'total', 'paid', 'balance'].map((k) => (
                          <th key={k}>
                            <input type="search" className="table-col-filter" aria-label={k} value={payFilters[k] || ''} onChange={(e) => setPayFilter(k, e.target.value)} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const has = (v, q) => !q || String(v ?? '').toLowerCase().includes(q.toLowerCase());
                        const rows = invoices.filter((i) => i.status !== 'paid').filter((i) => has(customerName(i.customerId), payFilters.customer)
                          && has(fmtDateTime(i.date), payFilters.date) && has(`${i.grade} ${t[i.grade] || ''}`, payFilters.grade)
                          && has(i.qty, payFilters.qty) && has(i.total ?? i.amount, payFilters.total)
                          && has(i.paid, payFilters.paid) && has(i.balance, payFilters.balance));
                        if (!rows.length) return <tr><td colSpan={8} className="muted">{t.noEntries}</td></tr>;
                        return rows.map((i) => {
                          const on = payf.invoiceId === i._id;
                          return (
                            <tr key={i._id} className={`pick-row${on ? ' picked' : ''}`} onClick={() => pickInvoice(i)} aria-selected={on}>
                              <td className="rownum">
                                <input type="radio" name="payInvoice" checked={on} onChange={() => pickInvoice(i)} aria-label={customerName(i.customerId)} />
                              </td>
                              <td><strong>{customerName(i.customerId)}</strong></td>
                              <td><DateTime value={i.date} /></td>
                              <td>{t[i.grade] || i.grade}</td>
                              <td>{Number(i.qty).toLocaleString()}</td>
                              <td>{Number(i.total ?? i.amount).toLocaleString()}</td>
                              <td>{Number(i.paid || 0).toLocaleString()}</td>
                              <td><strong className="warn">{Number(i.balance ?? i.amount).toLocaleString()}</strong></td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
              <label>
                {t.amount}
                <input required inputMode="decimal" placeholder="Payment amount" value={fmtMoney(payf.amount)} onChange={(e) => setPayf({ ...payf, amount: unfmtMoney(e.target.value) })} />
                <AmountHint value={payf.amount} />
              </label>
              <label>
                {t.entryDate}
                <input type="date" required max={new Date().toISOString().slice(0, 10)} value={payf.date} onChange={(e) => setPayf({ ...payf, date: e.target.value })} />
              </label>
              <label>
                {t.mode}
                <select value={payf.mode} onChange={(e) => setPayf({ ...payf, mode: e.target.value })}>
                  {payModes.active.map((m) => <option key={m.key} value={m.key}>{typeLabel(m, lang)}</option>)}
                </select>
              </label>
            </div>
            <button className="primary" style={{ marginTop: '0.35rem' }}>
              {t.recordPayment}
            </button>
          </form>
        )}

        {activeFormTab === 'customer' && (
          <form className="grid" onSubmit={addCustomer}>
            <div className="grid two" style={{ gap: '0.85rem' }}>
              <label>
                {t.name}
                <input required placeholder="Customer or Company name" value={cf.name} onChange={(e) => setCf({ ...cf, name: e.target.value })} />
              </label>
              <label>
                {t.customerType}
                <select value={cf.type} onChange={(e) => setCf({ ...cf, type: e.target.value })}>
                  {custTypes.active.map((c) => <option key={c.key} value={c.key}>{typeLabel(c, lang)}</option>)}
                </select>
              </label>
            </div>
            <button className="primary" style={{ marginTop: '0.35rem' }}>
              {t.add} {t.customer}
            </button>
          </form>
        )}

        {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>{msg.text}</p>}
      </div>

      {/* Invoices List with Column Outlines and Quick Filters */}
      <div className="card table-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem' }}>
          <h2 style={{ margin: 0, border: 'none', padding: 0 }}>{t.sales} / Invoices ({invoices.filter((i) => {
            if (filters.date && !String(fmtDateTime(i.date)).toLowerCase().includes(filters.date.toLowerCase())) return false;
            if (filters.customer && !String(customerName(i.customerId)).toLowerCase().includes(filters.customer.toLowerCase())) return false;
            if (filters.grade && !String(t[i.grade] || i.grade).toLowerCase().includes(filters.grade.toLowerCase())) return false;
            if (filters.qty && !String(i.qty).toLowerCase().includes(filters.qty.toLowerCase())) return false;
            if (filters.amount && !String(i.amount).toLowerCase().includes(filters.amount.toLowerCase())) return false;
            if (filters.status && !String(i.status).toLowerCase().includes(filters.status.toLowerCase())) return false;
            return true;
          }).length} / {invoices.length})</h2>
          {hasActiveFilters && (
            <button type="button" className="clear-filter-btn" onClick={clearFilters}>
              ✕ Clear Filters
            </button>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th className="rownum">#</th>
              <th>{t.dateTime}</th>
              <th className="sticky-col">{t.customer}</th>
              <th>{t.grade}</th>
              <th>{t.qty}</th>
              <th>{t.amount}</th>
              <th>{t.status}</th>
              <th className="actions">{t.action}</th>
            </tr>
            <tr className="filter-row">
              <th className="rownum" />
              <th><input type="search" className="table-col-filter" value={filters.date || ''} onChange={(e) => updateFilter('date', e.target.value)} /></th>
              <th><input type="search" className="table-col-filter" value={filters.customer || ''} onChange={(e) => updateFilter('customer', e.target.value)} /></th>
              <th><input type="search" className="table-col-filter" value={filters.grade || ''} onChange={(e) => updateFilter('grade', e.target.value)} /></th>
              <th><input type="search" className="table-col-filter" value={filters.qty || ''} onChange={(e) => updateFilter('qty', e.target.value)} /></th>
              <th><input type="search" className="table-col-filter" value={filters.amount || ''} onChange={(e) => updateFilter('amount', e.target.value)} /></th>
              <th><input type="search" className="table-col-filter" value={filters.status || ''} onChange={(e) => updateFilter('status', e.target.value)} /></th>
              <th className="actions" />
            </tr>
          </thead>
          <tbody>
            {invoices
              .filter((i) => {
                if (filters.date && !String(fmtDateTime(i.date)).toLowerCase().includes(filters.date.toLowerCase())) return false;
                if (filters.customer && !String(customerName(i.customerId)).toLowerCase().includes(filters.customer.toLowerCase())) return false;
                if (filters.grade && !String(t[i.grade] || i.grade).toLowerCase().includes(filters.grade.toLowerCase())) return false;
                if (filters.qty && !String(i.qty).toLowerCase().includes(filters.qty.toLowerCase())) return false;
                if (filters.amount && !String(i.amount).toLowerCase().includes(filters.amount.toLowerCase())) return false;
                if (filters.status && !String(i.status).toLowerCase().includes(filters.status.toLowerCase())) return false;
                return true;
              })
              .map((i, idx) => {
                const editing = editor.isEditing(i._id);
                return (
                <tr key={i._id}>
                  <td className="rownum">{idx + 1}</td>
                  <td><DateTime value={i.date} /></td>
                  <td><strong>{customerName(i.customerId)}</strong></td>
                  <td>
                    <span className="badge" style={{ background: '#f1f5f9', color: '#334155', border: '1px solid var(--line)' }}>
                      {t[i.grade] || i.grade}
                    </span>
                  </td>
                  <td>{editing ? <input inputMode="numeric" className="cell-input" {...editor.field('qty')} /> : Number(i.qty).toLocaleString()}</td>
                  <td>
                    {editing
                      ? <input inputMode="decimal" className="cell-input" title={t.rate} {...editor.field('rate')} />
                      : <strong className="ok">{Number(i.amount).toLocaleString()}</strong>}
                  </td>
                  <td>
                    {i.status === 'paid' ? (
                      <span className="badge green">✓ {t.paid}</span>
                    ) : Number(i.paid) > 0 ? (
                      <span className="badge yellow" title={`${t.paid}: ${Number(i.paid).toLocaleString()}`}>
                        {t.partPaid} — {t.balanceDue}: {Number(i.balance).toLocaleString()}
                      </span>
                    ) : (
                      <span className="badge yellow">⏳ {t.open}</span>
                    )}
                  </td>
                  <td className="actions">
                    <RowActions
                      editor={editor} id={i._id} path={`/invoices/${i._id}`}
                      name={`${customerName(i.customerId)} — ${Number(i.amount).toLocaleString()}`}
                      initial={{ qty: String(i.qty), rate: String(i.rate) }}
                      toPayload={(d) => ({ qty: Number(d.qty), rate: d.rate })}
                      onSaved={() => { setMsg({ text: t.savedOk, bad: false }); load(); }}
                      onDeleted={afterDelete}
                      onError={onDelError}
                    />
                  </td>
                </tr>
                );
              })}
            {!invoices.length && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                  {t.noEntries}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
