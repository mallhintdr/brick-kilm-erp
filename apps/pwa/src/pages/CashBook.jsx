import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, fmtDate, fmtDateTime, getRole } from '../api.js';
import DateTime from '../components/DateTime.jsx';
import RowActions, { useRowEdit } from '../components/RowActions.jsx';

const EDIT_PATH = { payment: 'payments', expense: 'expenses', advance: 'advances' };

const today = () => new Date().toISOString().slice(0, 10);

export default function CashBook() {
  const t = useT();
  const [date, setDate] = useState(today());
  const [book, setBook] = useState(null);
  const [err, setErr] = useState('');
  const [incFilters, setIncFilters] = useState({});
  const [expFilters, setExpFilters] = useState({});
  const [msg, setMsg] = useState({ text: '', bad: false });
  const editor = useRowEdit();
  // Today's entries can be corrected by staff; past days only by the owner.
  const canEdit = getRole() === 'owner' || date === today();

  const load = () => get(`/cashbook?date=${date}`).then(setBook).catch((e) => setErr(e.message));
  useEffect(() => { editor.stop(); load(); }, [date]);

  // Amount (and payee for expenses) edited in place; RowActions handles edit/save/cancel.
  const amountCell = (r) => (editor.isEditing(r.id)
    ? <input inputMode="decimal" className="cell-input" {...editor.field('amount')} />
    : null);
  const nameCell = (r) => (editor.isEditing(r.id) && r.kind === 'expense'
    ? <input className="cell-input" {...editor.field('payee')} />
    : <strong>{r.name}</strong>);
  const actions = (r) => (
    <td className="actions">
      {r.id && (
        <RowActions
          editor={editor} id={r.id} path={`/${EDIT_PATH[r.kind]}/${r.id}`} name={r.name}
          initial={r.kind === 'expense' ? { amount: String(r.amount), payee: r.name } : { amount: String(r.amount) }}
          toPayload={(d) => (r.kind === 'expense' ? { amount: d.amount, payee: d.payee } : { amount: d.amount })}
          canEdit={canEdit} canDelete={false}
          onSaved={() => { setMsg({ text: t.savedOk, bad: false }); load(); }}
          onError={(m) => setMsg({ text: m, bad: true })}
        />
      )}
    </td>
  );

  return (
    <div className="grid">
      {/* Date selector toolbar */}
      <div className="card row" style={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--brand-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-dark)', border: '1.5px solid var(--brand-dark)' }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>{t.cashbook}</div>
            <strong style={{ fontSize: '0.98rem', color: 'var(--ink)' }}>{fmtDate(date)}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <input
            type="date"
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value)}
            style={{ minHeight: '36px', padding: '0.25rem 0.65rem', fontSize: '0.84rem' }}
          />
          <button
            type="button"
            className="ghost"
            style={{ minHeight: '36px', padding: '0.25rem 0.75rem', fontSize: '0.82rem' }}
            onClick={() => setDate(today())}
          >
            {t.day}
          </button>
        </div>
      </div>

      {err && <p role="alert" className="err">{err}</p>}
      {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>{msg.text}</p>}

      {book && (
        <>
          {/* Daily Cash KPIs Grouped by Type (filled with 18-20% opaque color, swapped sizes, no Rs) */}
          <div className="kpi-section">
            <div className="kpi-group">
              <h3 className="kpi-group-title">
                {t.groupInflows}
              </h3>
              <div className="kpi-grid">
                <div className="stat" style={{ borderInlineStartColor: 'var(--info)' }}>
                  <span>{t.openingCash}</span>
                  <strong>{Number(book.openingCash).toLocaleString()}</strong>
                </div>
                <div className="stat" style={{ borderInlineStartColor: 'var(--ok-dark)' }}>
                  <span>{t.totalIn}</span>
                  <strong className="ok">+{Number(book.totalIn).toLocaleString()}</strong>
                </div>
              </div>
            </div>

            <div className="kpi-group">
              <h3 className="kpi-group-title">
                {t.groupOutflows}
              </h3>
              <div className="kpi-grid">
                <div className="stat" style={{ borderInlineStartColor: 'var(--err-dark)' }}>
                  <span>{t.totalOut}</span>
                  <strong className="err">-{Number(book.totalOut).toLocaleString()}</strong>
                </div>
                <div className="stat" style={{ borderInlineStartColor: 'var(--brand-dark)' }}>
                  <span>{t.closingCash}</span>
                  <strong>{Number(book.closingCash).toLocaleString()}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Income Table with Column Outlines */}
          {/* Income Table with Column Outlines and Quick Filters */}
          <div className="card table-wrap">
            <div style={{ padding: '0.75rem 1rem 0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>{t.incomeDetails}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                {Object.values(incFilters).some(Boolean) && (
                  <button type="button" className="clear-filter-btn" onClick={() => setIncFilters({})}>
                    ✕ Clear
                  </button>
                )}
                <span className="badge green">+{Number(book.totalIn).toLocaleString()}</span>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th className="rownum">#</th>
                  <th>{t.dateTime}</th>
                  <th className="sticky-col">{t.name}</th>
                  <th>{t.details}</th>
                  <th>{t.amount}</th>
                  <th className="actions">{t.action}</th>
                </tr>
                <tr className="filter-row">
                  <th className="rownum" />
                  <th><input type="search" className="table-col-filter" value={incFilters.at || ''} onChange={(e) => setIncFilters({ ...incFilters, at: e.target.value })} /></th>
                  <th><input type="search" className="table-col-filter" value={incFilters.name || ''} onChange={(e) => setIncFilters({ ...incFilters, name: e.target.value })} /></th>
                  <th><input type="search" className="table-col-filter" value={incFilters.detail || ''} onChange={(e) => setIncFilters({ ...incFilters, detail: e.target.value })} /></th>
                  <th><input type="search" className="table-col-filter" value={incFilters.amount || ''} onChange={(e) => setIncFilters({ ...incFilters, amount: e.target.value })} /></th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {book.income
                  .filter((r) => {
                    if (incFilters.at && !String(fmtDateTime(r.at)).toLowerCase().includes(incFilters.at.toLowerCase())) return false;
                    if (incFilters.name && !String(r.name || '').toLowerCase().includes(incFilters.name.toLowerCase())) return false;
                    if (incFilters.detail && !String(r.detail || '').toLowerCase().includes(incFilters.detail.toLowerCase())) return false;
                    if (incFilters.amount && !String(r.amount).toLowerCase().includes(incFilters.amount.toLowerCase())) return false;
                    return true;
                  })
                  .map((r, i) => (
                    <tr key={r.id || i}>
                      <td className="rownum">{i + 1}</td>
                      <td><DateTime value={r.at} /></td>
                      <td>{nameCell(r)}</td>
                      <td>{r.detail}</td>
                      <td className="ok">{amountCell(r) ?? <strong>+{Number(r.amount).toLocaleString()}</strong>}</td>
                      {actions(r)}
                    </tr>
                  ))}
                {!book.income.length && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '1.25rem', color: 'var(--muted)' }}>
                      {t.noEntries}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Expense Table with Column Outlines and Quick Filters */}
          <div className="card table-wrap">
            <div style={{ padding: '0.75rem 1rem 0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>{t.expenseDetails}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                {Object.values(expFilters).some(Boolean) && (
                  <button type="button" className="clear-filter-btn" onClick={() => setExpFilters({})}>
                    ✕ Clear
                  </button>
                )}
                <span className="badge red">-{Number(book.totalOut).toLocaleString()}</span>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th className="rownum">#</th>
                  <th>{t.dateTime}</th>
                  <th className="sticky-col">{t.name}</th>
                  <th>{t.details}</th>
                  <th>{t.amount}</th>
                  <th className="actions">{t.action}</th>
                </tr>
                <tr className="filter-row">
                  <th className="rownum" />
                  <th><input type="search" className="table-col-filter" value={expFilters.at || ''} onChange={(e) => setExpFilters({ ...expFilters, at: e.target.value })} /></th>
                  <th><input type="search" className="table-col-filter" value={expFilters.name || ''} onChange={(e) => setExpFilters({ ...expFilters, name: e.target.value })} /></th>
                  <th><input type="search" className="table-col-filter" value={expFilters.detail || ''} onChange={(e) => setExpFilters({ ...expFilters, detail: e.target.value })} /></th>
                  <th><input type="search" className="table-col-filter" value={expFilters.amount || ''} onChange={(e) => setExpFilters({ ...expFilters, amount: e.target.value })} /></th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {book.expense
                  .filter((r) => {
                    if (expFilters.at && !String(fmtDateTime(r.at)).toLowerCase().includes(expFilters.at.toLowerCase())) return false;
                    if (expFilters.name && !String(r.name || '').toLowerCase().includes(expFilters.name.toLowerCase())) return false;
                    if (expFilters.detail && !String(r.detail || '').toLowerCase().includes(expFilters.detail.toLowerCase())) return false;
                    if (expFilters.amount && !String(r.amount).toLowerCase().includes(expFilters.amount.toLowerCase())) return false;
                    return true;
                  })
                  .map((r, i) => (
                    <tr key={r.id || i}>
                      <td className="rownum">{i + 1}</td>
                      <td><DateTime value={r.at} /></td>
                      <td>{nameCell(r)}</td>
                      <td>{r.detail}</td>
                      <td className="err">{amountCell(r) ?? <strong>-{Number(r.amount).toLocaleString()}</strong>}</td>
                      {actions(r)}
                    </tr>
                  ))}
                {!book.expense.length && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '1.25rem', color: 'var(--muted)' }}>
                      {t.noEntries}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

