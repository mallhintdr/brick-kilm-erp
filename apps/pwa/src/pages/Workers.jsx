import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, post, uuid, getRole } from '../api.js';
import { useTypes, typeLabel } from '../useTypes.js';
import RowActions, { useRowEdit } from '../components/RowActions.jsx';
import { useLang } from '../i18n.js';

const blank = { name: '', fatherName: '', cnic: '', dob: '', category: 'pathera', eobiNo: '', pessiNo: '' };

export default function Workers() {
  const t = useT();
  const { lang } = useLang();
  const cats = useTypes('workerCategory');
  const [list, setList] = useState([]);
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [submitting, setSubmitting] = useState(false);
  const editor = useRowEdit();
  // Server enforces the per-user permission matrix; this just hides the icon where it would 403.
  const canEditWorkers = ['owner', 'munshi'].includes(getRole());

  const load = () => get('/workers').then(setList).catch(() => {});
  useEffect(() => { load(); }, []);

  const unregistered = list.filter((w) => !w.eobiNo && !w.pessiNo).length;

  async function add(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const r = await post('/workers', { ...f, clientUuid: uuid() });
      setMsg({ text: r.queued ? t.queued : r.warning || t.savedOk, bad: false });
      setF(blank);
      load();
    } catch (e2) {
      setMsg({ text: e2.message, bad: true });
    } finally {
      setSubmitting(false);
    }
  }

  async function markSigned(id) {
    await post(`/workers/${id}/contract-signed`, { signedDocUrl: 'pending-upload' }).catch((e) => setMsg({ text: e.message, bad: true }));
    load();
  }

  const [filters, setFilters] = useState({});
  const updateFilter = (k, v) => setFilters((prev) => ({ ...prev, [k]: v }));
  const clearFilters = () => setFilters({});
  const hasActiveFilters = Object.values(filters).some(Boolean);

  const filteredList = list.filter((w) => {
    if (filters.name && !String(w.name || '').toLowerCase().includes(filters.name.toLowerCase())) return false;
    if (filters.fatherName && !String(w.fatherName || '').toLowerCase().includes(filters.fatherName.toLowerCase())) return false;
    if (filters.category && !String(cats.label(w.category) || w.category || '').toLowerCase().includes(filters.category.toLowerCase())) return false;
    if (filters.contract && !String(w.contractSigned ? t.signed : 'pending').toLowerCase().includes(filters.contract.toLowerCase())) return false;
    if (filters.eobiNo && !String(w.eobiNo || '').toLowerCase().includes(filters.eobiNo.toLowerCase())) return false;
    if (filters.pessiNo && !String(w.pessiNo || '').toLowerCase().includes(filters.pessiNo.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="grid">
      {/* Grouped Workforce & Compliance KPI Cards */}
      <div className="kpi-section">
        <div className="kpi-group">
          <h3 className="kpi-group-title">
            Workforce Registry & Legal Compliance (مزدور اور قانونی رجسٹریشن)
          </h3>
          <div className="kpi-grid">
            <div className="stat" style={{ borderInlineStartColor: 'var(--brand-dark)' }}>
              <span>Total Workers</span>
              <strong>{list.length}</strong>
            </div>
            <div className="stat" style={{ borderInlineStartColor: unregistered ? 'var(--warn-dark)' : 'var(--ok-dark)' }}>
              <span>{t.complianceGaps}</span>
              <strong className={unregistered ? 'warn' : 'ok'}>
                {unregistered} / {list.length}
              </strong>
            </div>
            <div className="stat" style={{ borderInlineStartColor: 'var(--ok-dark)' }}>
              <span>{t.signed} Contracts</span>
              <strong className="ok">{list.filter((w) => w.contractSigned).length}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Registration Form with Dark Brand Outline Inputs */}
      <form className="card grid" onSubmit={add}>
        <h2>{t.add} {t.worker}</h2>
        <div className="grid two" style={{ gap: '0.85rem' }}>
          <label>
            {t.name}
            <input required placeholder="Worker full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </label>
          <label>
            {t.fatherName}
            <input required minLength={2} value={f.fatherName} onChange={(e) => setF({ ...f, fatherName: e.target.value })} />
          </label>
          <label>
            {t.cnic}
            <input required inputMode="numeric" value={f.cnic} onChange={(e) => setF({ ...f, cnic: e.target.value })} placeholder="35201-1234567-1" />
          </label>
          <label>
            {t.dob}
            <input required type="date" value={f.dob} onChange={(e) => setF({ ...f, dob: e.target.value })} />
          </label>
          <label>
            {t.category}
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {cats.active.map((c) => (
                <option key={c.key} value={c.key}>{typeLabel(c, lang)}</option>
              ))}
            </select>
          </label>
          <label>
            {t.eobiNo}
            <input placeholder="Optional EOBI #" value={f.eobiNo} onChange={(e) => setF({ ...f, eobiNo: e.target.value })} />
          </label>
          <label>
            {t.pessiNo}
            <input placeholder="Optional PESSI #" value={f.pessiNo} onChange={(e) => setF({ ...f, pessiNo: e.target.value })} />
          </label>
        </div>
        <button className="primary" disabled={submitting}>
          ➕ {t.add} Worker
        </button>
        {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>{msg.text}</p>}
      </form>

      {/* Workers Roster Table with Column Outlines and Quick Filters */}
      <div className="card table-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem' }}>
          <h2 style={{ margin: 0, border: 'none', padding: 0 }}>
            {t.workers} ({filteredList.length} / {list.length})
          </h2>
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
              <th className="sticky-col">{t.name}</th>
              <th>{t.fatherName}</th>
              <th>{t.category}</th>
              <th>{t.contract}</th>
              <th>{t.eobiNo}</th>
              <th>{t.pessiNo}</th>
              <th className="actions">{t.action}</th>
            </tr>
            <tr className="filter-row">
              <th className="rownum" />
              <th className="sticky-col">
                <input
                  type="search"
                  className="table-col-filter"
                  value={filters.name || ''}
                  onChange={(e) => updateFilter('name', e.target.value)}
                />
              </th>
              <th>
                <input
                  type="search"
                  className="table-col-filter"
                  value={filters.fatherName || ''}
                  onChange={(e) => updateFilter('fatherName', e.target.value)}
                />
              </th>
              <th>
                <input
                  type="search"
                  className="table-col-filter"
                  value={filters.category || ''}
                  onChange={(e) => updateFilter('category', e.target.value)}
                />
              </th>
              <th>
                <input
                  type="search"
                  className="table-col-filter"
                  value={filters.contract || ''}
                  onChange={(e) => updateFilter('contract', e.target.value)}
                />
              </th>
              <th>
                <input
                  type="search"
                  className="table-col-filter"
                  value={filters.eobiNo || ''}
                  onChange={(e) => updateFilter('eobiNo', e.target.value)}
                />
              </th>
              <th>
                <input
                  type="search"
                  className="table-col-filter"
                  value={filters.pessiNo || ''}
                  onChange={(e) => updateFilter('pessiNo', e.target.value)}
                />
              </th>
              <th className="actions" />
            </tr>
          </thead>
          <tbody>
            {filteredList.map((w, i) => {
              const editing = editor.isEditing(w._id);
              return (
              <tr key={w._id}>
                <td className="rownum">{i + 1}</td>
                <td className="sticky-col">{editing ? <input className="cell-input" {...editor.field('name')} /> : <strong style={{ color: 'var(--ink)' }}>{w.name}</strong>}</td>
                <td>{editing ? <input className="cell-input" {...editor.field('fatherName')} /> : (w.fatherName || <span className="muted">—</span>)}</td>
                <td>
                  {editing ? (
                    <select className="cell-input" {...editor.field('category')}>
                      {cats.active.map((c) => <option key={c.key} value={c.key}>{typeLabel(c, lang)}</option>)}
                    </select>
                  ) : (
                    <span className="badge" style={{ background: 'var(--brand-tint)', color: 'var(--brand-dark)', border: '1.5px solid var(--brand-dark)' }}>
                      {cats.label(w.category)}
                    </span>
                  )}
                </td>
                <td>
                  {w.contractSigned ? (
                    <span className="badge green">✓ {t.signed}</span>
                  ) : (
                    <button type="button" className="ghost" style={{ minHeight: '32px', padding: '0.2rem 0.6rem', fontSize: '0.78rem' }} onClick={() => markSigned(w._id)}>
                      ✍️ {t.markSigned}
                    </button>
                  )}
                </td>
                <td>{editing ? <input className="cell-input" {...editor.field('eobiNo')} /> : (w.eobiNo || <span className="muted">—</span>)}</td>
                <td>{editing ? <input className="cell-input" {...editor.field('pessiNo')} /> : (w.pessiNo || <span className="muted">—</span>)}</td>
                <td className="actions">
                  <RowActions
                    editor={editor} id={w._id} path={`/workers/${w._id}`} name={w.name}
                    initial={{ name: w.name, fatherName: w.fatherName || '', category: w.category, eobiNo: w.eobiNo || '', pessiNo: w.pessiNo || '' }}
                    toPayload={(d) => Object.fromEntries(Object.entries(d).filter(([k, v]) => v !== '' || k === 'eobiNo' || k === 'pessiNo'))}
                    canEdit={canEditWorkers}
                    onSaved={() => { setMsg({ text: t.savedOk, bad: false }); load(); }}
                    onDeleted={() => { setMsg({ text: t.deleted, bad: false }); load(); }}
                    onError={(m) => setMsg({ text: m, bad: true })}
                  />
                </td>
              </tr>
              );
            })}
            {!filteredList.length && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                  {t.noEntries || 'No workers matching criteria.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
