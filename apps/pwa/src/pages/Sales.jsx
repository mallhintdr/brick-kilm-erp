import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, post, uuid, fmtDateTime } from '../api.js';
import { useTypes, typeLabel } from '../useTypes.js';
import DeleteButton from '../components/DeleteButton.jsx';
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
  const [invf, setInvf] = useState({ customerId: '', grade: 'awwal', qty: '', taxPct: '0' });
  const [payf, setPayf] = useState({ invoiceId: '', amount: '', mode: 'cash' });
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [activeFormTab, setActiveFormTab] = useState('invoice');
  const [filters, setFilters] = useState({});
  const updateFilter = (k, v) => setFilters((prev) => ({ ...prev, [k]: v }));
  const clearFilters = () => setFilters({});
  const hasActiveFilters = Object.values(filters).some(Boolean);

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
              📊 {t.groupReceivablesTotal}
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
              ⏳ {t.groupAging}
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
            🧾 {t.newInvoice}
          </button>
          <button
            type="button"
            className={activeFormTab === 'payment' ? 'primary' : 'ghost'}
            onClick={() => setActiveFormTab('payment')}
          >
            💵 {t.recordPayment}
          </button>
          <button
            type="button"
            className={activeFormTab === 'customer' ? 'primary' : 'ghost'}
            onClick={() => setActiveFormTab('customer')}
          >
            👤 {t.newCustomer}
          </button>
        </div>

        {activeFormTab === 'invoice' && (
          <form className="grid" onSubmit={addInvoice}>
            <div className="grid two" style={{ gap: '0.85rem' }}>
              <label>
                {t.customer}
                <select required value={invf.customerId} onChange={(e) => setInvf({ ...invf, customerId: e.target.value })}>
                  <option value="" disabled>— Select Customer —</option>
                  {customers.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </label>
              <label>
                {t.grade}
                <select value={invf.grade} onChange={(e) => setInvf({ ...invf, grade: e.target.value })}>
                  <option value="awwal">🥇 {t.awwal}</option>
                  <option value="doem">🥈 {t.doem}</option>
                  <option value="khangar">🥉 {t.khangar}</option>
                </select>
              </label>
              <label>
                {t.qty}
                <input required inputMode="numeric" placeholder="e.g. 5000" value={invf.qty} onChange={(e) => setInvf({ ...invf, qty: e.target.value })} />
              </label>
              <label>
                {t.taxPct} (%)
                <input inputMode="decimal" placeholder="0" value={invf.taxPct} onChange={(e) => setInvf({ ...invf, taxPct: e.target.value })} />
              </label>
            </div>
            <button className="primary" style={{ marginTop: '0.35rem' }}>
              ➕ Create {t.newInvoice}
            </button>
          </form>
        )}

        {activeFormTab === 'payment' && (
          <form className="grid" onSubmit={addPayment}>
            <div className="grid two" style={{ gap: '0.85rem' }}>
              <label style={{ gridColumn: '1 / -1' }}>
                {t.invoice}
                <select required value={payf.invoiceId} onChange={(e) => setPayf({ ...payf, invoiceId: e.target.value })}>
                  <option value="" disabled>— Select Unpaid Invoice —</option>
                  {invoices.filter((i) => i.status !== 'paid').map((i) => (
                    <option key={i._id} value={i._id}>
                      {customerName(i.customerId)} — {i.grade} ({i.qty} bricks) — Due: {i.amount}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.amount}
                <input required inputMode="decimal" placeholder="Payment amount" value={payf.amount} onChange={(e) => setPayf({ ...payf, amount: e.target.value })} />
              </label>
              <label>
                {t.mode}
                <select value={payf.mode} onChange={(e) => setPayf({ ...payf, mode: e.target.value })}>
                  {payModes.active.map((m) => <option key={m.key} value={m.key}>{typeLabel(m, lang)}</option>)}
                </select>
              </label>
            </div>
            <button className="primary" style={{ marginTop: '0.35rem' }}>
              💾 {t.recordPayment}
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
              ➕ {t.add} {t.customer}
            </button>
          </form>
        )}

        {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>{msg.text}</p>}
      </div>

      {/* Invoices List with Column Outlines and Quick Filters */}
      <div className="card table-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem' }}>
          <h2 style={{ margin: 0, border: 'none', padding: 0 }}>🧾 {t.sales} / Invoices ({invoices.filter((i) => {
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
              <th>{t.customer}</th>
              <th>{t.grade}</th>
              <th>{t.qty}</th>
              <th>{t.amount}</th>
              <th>{t.status}</th>
              <th className="actions" />
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
              .map((i, idx) => (
                <tr key={i._id}>
                  <td className="rownum">{idx + 1}</td>
                  <td>{fmtDateTime(i.date)}</td>
                  <td><strong>{customerName(i.customerId)}</strong></td>
                  <td>
                    <span className="badge" style={{ background: '#f1f5f9', color: '#334155', border: '1px solid var(--line)' }}>
                      {t[i.grade] || i.grade}
                    </span>
                  </td>
                  <td>{Number(i.qty).toLocaleString()}</td>
                  <td><strong className="ok">{Number(i.amount).toLocaleString()}</strong></td>
                  <td>
                    <span className={`badge ${i.status === 'paid' ? 'green' : 'yellow'}`}>
                      {i.status === 'paid' ? `✓ ${t.paid}` : `⏳ ${t.open}`}
                    </span>
                  </td>
                  <td className="actions">
                    <DeleteButton
                      path={`/invoices/${i._id}`}
                      name={`${customerName(i.customerId)} — ${Number(i.amount).toLocaleString()}`}
                      onDone={afterDelete}
                      onError={onDelError}
                    />
                  </td>
                </tr>
              ))}
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
