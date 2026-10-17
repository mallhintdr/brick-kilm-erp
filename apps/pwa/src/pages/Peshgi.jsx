import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { Link } from 'react-router-dom';
import { get, post, uuid, getRole, fmtDateTime } from '../api.js';
import AmountHint from '../components/AmountHint.jsx';
import DateTime from '../components/DateTime.jsx';
import SearchSelect from '../components/SearchSelect.jsx';

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

  return (
    <div className="grid">
      {/* Advance / Recovery Action Card */}
      <div className="card grid">
        <h2>{t.peshgi} — Advance & Recovery Engine</h2>

        <div className="grid two" style={{ gap: '0.9rem' }}>
          <label style={{ gridColumn: '1 / -1' }}>
            {t.worker}
            <SearchSelect
              ariaLabel={t.worker} placeholder={t.typeToSearch} value={workerId} onChange={setWorkerId}
              options={workers.map((w) => ({
                value: w._id,
                label: w.fatherName ? `${w.name} — ${w.fatherName}` : w.name,
                search: `${w.cnic || ''} ${w.category || ''} ${w.phone || ''}`,
              }))}
            />
          </label>
        </div>

        {/* Worker Balance Tile & Slip Print */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid var(--line)' }}>
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              {t.outstanding} ({selectedWorker?.name || ''})
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: Number(balance) > 0 ? 'var(--brand-dark)' : 'var(--ok)' }}>
              {balance !== null ? Number(balance).toLocaleString() : '—'}
            </div>
          </div>

          {workerId && (
            <Link className="ghost" to={`/print/worker/${workerId}`} target="_blank" rel="noopener">
              🖨️ {t.printSlip}
            </Link>
          )}
        </div>

        <div className="grid two" style={{ gap: '0.9rem' }}>
          <label>
            {t.entryDate}
            <input type="date" required max={new Date().toISOString().slice(0, 10)} value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </label>
          <label>
            {t.amount} (Rs)
            <input
              inputMode="decimal"
              placeholder="e.g. 5000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <AmountHint value={amount} />
          </label>

          {getRole() === 'owner' ? (
            <label>
              {t.reason}
              <input
                placeholder="Optional override note"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          ) : <div />}
        </div>

        <div className="row" style={{ marginTop: '0.4rem' }}>
          <button
            className="primary"
            disabled={!workerId || !amount || submitting}
            onClick={() => submit('/advances')}
          >
            💸 {t.advance}
          </button>
          <button
            className="ghost"
            style={{ borderColor: 'var(--ok-line)', background: 'var(--ok-tint)', color: 'var(--ok-dark)' }}
            disabled={!workerId || !amount || submitting}
            onClick={() => submit('/recoveries')}
          >
            📥 {t.recovery}
          </button>
        </div>

        {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>{msg.text}</p>}
      </div>

      {/* Ledger History Table with Column Outlines and Quick Filters */}
      <div className="card table-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem' }}>
          <h2 style={{ margin: 0, border: 'none', padding: 0 }}>{t.ledgerHistory} ({entries.filter((e) => {
            if (filters.date && !String(fmtDateTime(e.createdAt)).toLowerCase().includes(filters.date.toLowerCase())) return false;
            if (filters.account && !String(e.account === 'peshgi' ? t.peshgi : t.earnings).toLowerCase().includes(filters.account.toLowerCase())) return false;
            if (filters.type && !String(e.type).toLowerCase().includes(filters.type.toLowerCase())) return false;
            if (filters.amount && !String(Number(e.debit) || Number(e.credit) || '').toLowerCase().includes(filters.amount.toLowerCase())) return false;
            return true;
          }).length} / {entries.length})</h2>
          {Object.values(filters).some(Boolean) && (
            <button type="button" className="clear-filter-btn" onClick={() => setFilters({})}>
              ✕ Clear Filters
            </button>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th className="rownum">#</th>
              <th>{t.dateTime}</th>
              <th className="sticky-col">{t.account}</th>
              <th>{t.type}</th>
              <th>{t.amount}</th>
            </tr>
            <tr className="filter-row">
              <th className="rownum" />
              <th><input type="search" className="table-col-filter" value={filters.date || ''} onChange={(e) => setFilters({ ...filters, date: e.target.value })} /></th>
              <th><input type="search" className="table-col-filter" value={filters.account || ''} onChange={(e) => setFilters({ ...filters, account: e.target.value })} /></th>
              <th><input type="search" className="table-col-filter" value={filters.type || ''} onChange={(e) => setFilters({ ...filters, type: e.target.value })} /></th>
              <th><input type="search" className="table-col-filter" value={filters.amount || ''} onChange={(e) => setFilters({ ...filters, amount: e.target.value })} /></th>
            </tr>
          </thead>
          <tbody>
            {entries
              .filter((e) => {
                if (filters.date && !String(fmtDateTime(e.createdAt)).toLowerCase().includes(filters.date.toLowerCase())) return false;
                if (filters.account && !String(e.account === 'peshgi' ? t.peshgi : t.earnings).toLowerCase().includes(filters.account.toLowerCase())) return false;
                if (filters.type && !String(e.type).toLowerCase().includes(filters.type.toLowerCase())) return false;
                if (filters.amount && !String(Number(e.debit) || Number(e.credit) || '').toLowerCase().includes(filters.amount.toLowerCase())) return false;
                return true;
              })
              .map((e, i) => (
                <tr key={e._id}>
                  <td className="rownum">{i + 1}</td>
                  <td><DateTime value={e.createdAt} /></td>
                  <td><strong>{e.account === 'peshgi' ? t.peshgi : t.earnings}</strong></td>
                  <td>
                    <span className="badge" style={{ background: '#f1f5f9', color: '#475569' }}>
                      {e.type}{e.reversesId ? ` (${t.reversal})` : ''}
                    </span>
                  </td>
                  <td className={Number(e.debit) > 0 ? 'ok' : 'err'}>
                    <strong>{Number(e.debit) > 0 ? `+${Number(e.debit).toLocaleString()}` : `-${Number(e.credit).toLocaleString()}`}</strong>
                  </td>
                </tr>
              ))}
            {!entries.length && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                  {t.noEntries || 'No ledger entries found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
