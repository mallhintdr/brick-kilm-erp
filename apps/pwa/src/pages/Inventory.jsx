import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, post, uuid, fmtDateTime } from '../api.js';
import DateTime from '../components/DateTime.jsx';
import { useTypes, typeLabel } from '../useTypes.js';
import RowActions, { useRowEdit } from '../components/RowActions.jsx';
import { useLang } from '../i18n.js';

export default function Inventory() {
  const t = useT();
  const editor = useRowEdit();
  const { lang } = useLang();
  const items = useTypes('procurementItem');
  // a new purchase item typed straight into the list (saved for next time too)
  async function addItem() {
    const name = window.prompt(t.newItemName);
    if (!name || !name.trim()) return;
    try {
      const r = await post('/types', { kind: 'procurementItem', label: name.trim() });
      await items.reload();
      setF((x) => ({ ...x, item: r.key }));
    } catch (e) { setMsg({ text: e.message, bad: true }); }
  }
  const [summary, setSummary] = useState(null);
  const [unloadings, setUnloadings] = useState([]);
  const [grns, setGrns] = useState([]);
  const [f, setF] = useState({ item: 'coal', supplierName: '', vehicleNo: '', qty: '', rate: '', freight: '0', date: new Date().toISOString().slice(0, 10) });
  const [lab, setLab] = useState({ calorificValue: '', ashPct: '', volatileMatterPct: '', silicaPct: '', aluminaPct: '', ironOxidePct: '' });
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState({});
  const setFilter = (k, v) => setFilters((f2) => ({ ...f2, [k]: v }));
  const has = (v, q) => !q || String(v ?? '').toLowerCase().includes(q.toLowerCase());
  const shownGrns = grns.filter((g) => has(fmtDateTime(g.date), filters.date) && has(items.label(g.item), filters.item)
    && has(g.supplierName, filters.supplier) && has(g.qty, filters.qty) && has(g.landedUnitCost, filters.cost));

  const load = () => {
    get('/inventory/summary').then(setSummary).catch(() => {});
    get('/unloadings').then(setUnloadings).catch(() => {});
    get('/grns').then(setGrns).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  async function submitGrn(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const labFields = Object.fromEntries(Object.entries(lab).filter(([, v]) => v !== ''));
      const r = await post('/grns', { ...f, labFields, clientUuid: uuid() });
      setMsg({ text: r.queued ? t.queued : `${t.savedOk} — ${t.landedCost}: ${r.landedUnitCost}`, bad: false });
      setF({ ...f, supplierName: '', vehicleNo: '', qty: '', rate: '' });
      setLab({ calorificValue: '', ashPct: '', volatileMatterPct: '', silicaPct: '', aluminaPct: '', ironOxidePct: '' });
      load();
    } catch (e2) {
      setMsg({ text: e2.message, bad: true });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid">
      {/* Stock on Hand Grouped Cards */}
      {summary && (
        <div className="kpi-section">
          {/* Group 1: Brick Stock by Grade */}
          <div className="kpi-group">
            <h3 className="kpi-group-title">
              Manufactured Brick Stock by Grade (اینٹوں کا ذخیرہ)
            </h3>
            <div className="kpi-grid">
              <div className="stat" style={{ borderInlineStartColor: 'var(--brand-dark)' }}>
                <span>{t.greenStock}</span>
                <strong>{summary.greenStock.toLocaleString()}</strong>
              </div>
              <div className="stat" style={{ borderInlineStartColor: 'var(--ok-dark)' }}>
                <span>🥇 {t.awwal}</span>
                <strong className="ok">{summary.firedStockByGrade.awwal.toLocaleString()}</strong>
              </div>
              <div className="stat" style={{ borderInlineStartColor: 'var(--info)' }}>
                <span>🥈 {t.doem}</span>
                <strong>{summary.firedStockByGrade.doem.toLocaleString()}</strong>
              </div>
              <div className="stat" style={{ borderInlineStartColor: 'var(--warn-dark)' }}>
                <span>🥉 {t.khangar}</span>
                <strong>{summary.firedStockByGrade.khangar.toLocaleString()}</strong>
              </div>
            </div>
          </div>

          {/* Group 2: Fuel & Raw Material Inventory */}
          <div className="kpi-group">
            <h3 className="kpi-group-title">
              Fuel & Raw Material Storage (ایندھن اور کوئلہ ذخیرہ)
            </h3>
            <div className="kpi-grid">
              <div className="stat" style={{ borderInlineStartColor: '#334155' }}>
                <span>⚫ {t.coalOnHand}</span>
                <strong>{summary.coalOnHandKg.toLocaleString()} kg</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Procurement (GRN) Form */}
      <form className="card grid" onSubmit={submitGrn}>
        <h2>{t.grnTitle} — Goods Receipt Note</h2>

        <div className="grid two" style={{ gap: '0.85rem' }}>
          <label>
            {t.item}
            <select value={f.item} onChange={(e) => (e.target.value === '__new' ? addItem() : setF({ ...f, item: e.target.value }))}>
              {!items.active.some((i) => i.key === f.item) && <option value="" disabled>—</option>}
              {items.active.map((i) => (
                <option key={i.key} value={i.key}>{typeLabel(i, lang)}</option>
              ))}
              <option value="__new">＋ {t.addNewItem}</option>
            </select>
          </label>

          <label>
            {t.supplier}
            <input required placeholder="Supplier or source name" value={f.supplierName} onChange={(e) => setF({ ...f, supplierName: e.target.value })} />
          </label>

          <label>
            {t.vehicle}
            <input placeholder="e.g. LES-4920" value={f.vehicleNo} onChange={(e) => setF({ ...f, vehicleNo: e.target.value })} />
          </label>

          <label>
            {t.quantity}
            <input required inputMode="decimal" placeholder={t.qtyUnitsHint} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
          </label>

          <label>
            {t.rate}
            <input required inputMode="decimal" placeholder="Price rate" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} />
          </label>

          <label>
            {t.entryDate}
            <input type="date" required max={new Date().toISOString().slice(0, 10)} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </label>

          <label>
            {t.freight}
            <input inputMode="decimal" placeholder="Freight / Kiraya" value={f.freight} onChange={(e) => setF({ ...f, freight: e.target.value })} />
          </label>
        </div>

        {/* Optional Lab Tests */}
        {f.item === 'coal' && (
          <details className="lab-box">
            <summary>
              {t.labFieldsOptional} (Coal Quality Parameters)
            </summary>
            <div className="grid two" style={{ gap: '0.75rem' }}>
              <label>
                {t.calorificValue}
                <input inputMode="decimal" placeholder="kcal/kg" value={lab.calorificValue} onChange={(e) => setLab({ ...lab, calorificValue: e.target.value })} />
              </label>
              <label>
                {t.ashPct}
                <input inputMode="decimal" placeholder="Ash %" value={lab.ashPct} onChange={(e) => setLab({ ...lab, ashPct: e.target.value })} />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                {t.volatileMatterPct}
                <input inputMode="decimal" placeholder="Volatile %" value={lab.volatileMatterPct} onChange={(e) => setLab({ ...lab, volatileMatterPct: e.target.value })} />
              </label>
            </div>
          </details>
        )}

        {f.item === 'soil' && (
          <details className="lab-box">
            <summary>
              {t.labFieldsOptional} (Soil Composition)
            </summary>
            <div className="grid two" style={{ gap: '0.75rem' }}>
              <label>
                {t.silicaPct}
                <input inputMode="decimal" placeholder="Silica %" value={lab.silicaPct} onChange={(e) => setLab({ ...lab, silicaPct: e.target.value })} />
              </label>
              <label>
                {t.aluminaPct}
                <input inputMode="decimal" placeholder="Alumina %" value={lab.aluminaPct} onChange={(e) => setLab({ ...lab, aluminaPct: e.target.value })} />
              </label>
            </div>
          </details>
        )}

        <button className="primary" disabled={submitting}>
          ➕ {t.add} GRN
        </button>

        {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>{msg.text}</p>}
      </form>

      {/* Recent GRN Purchases Table with Column Outlines */}
      <div className="card table-wrap">
        <h2>{t.recentGrns} ({shownGrns.length} / {grns.length})</h2>
        <table>
          <thead>
            <tr>
              <th className="rownum">#</th>
              <th className="sticky-col">{t.dateTime}</th>
              <th>{t.item}</th>
              <th>{t.supplier}</th>
              <th>{t.qty}</th>
              <th style={{ textAlign: 'end' }}>{t.landedCost}</th>
              <th className="actions">{t.action}</th>
            </tr>
            <tr className="filter-row">
              <th className="rownum" />
              {['date', 'item', 'supplier', 'qty', 'cost'].map((k) => (
                <th key={k}>
                  <input type="search" className="table-col-filter" aria-label={k} value={filters[k] || ''} onChange={(e) => setFilter(k, e.target.value)} />
                </th>
              ))}
              <th className="actions" />
            </tr>
          </thead>
          <tbody>
            {shownGrns.map((g, i) => {
              const editing = editor.isEditing(g._id);
              return (
              <tr key={g._id}>
                <td className="rownum">{i + 1}</td>
                <td className="dt-bold"><DateTime value={g.date} /></td>
                <td>
                  <span className="badge" style={{ background: '#f1f5f9', color: '#1e293b' }}>
                    {items.label(g.item)}
                  </span>
                </td>
                <td>{editing ? <input className="cell-input" {...editor.field('supplierName')} /> : <strong>{g.supplierName}</strong>}</td>
                <td>{editing ? <input inputMode="decimal" className="cell-input" {...editor.field('qty')} /> : g.qty}</td>
                <td style={{ textAlign: 'end' }}>
                  {editing
                    ? <input inputMode="decimal" className="cell-input" title={t.rate} {...editor.field('rate')} />
                    : <strong>{Number(g.landedUnitCost).toLocaleString()}</strong>}
                </td>
                <td className="actions">
                  <RowActions
                    editor={editor} id={g._id} path={`/grns/${g._id}`} name={`${items.label(g.item)} — ${g.supplierName}`}
                    initial={{ supplierName: g.supplierName || '', qty: String(g.qty ?? ''), rate: g.rate != null ? String(g.rate) : '' }}
                    toPayload={(d) => Object.fromEntries(Object.entries({ supplierName: d.supplierName?.trim(), qty: Number(d.qty) || undefined, rate: d.rate }).filter(([, v]) => v !== undefined && v !== '' && v !== 'undefined'))}
                    onSaved={() => { setMsg({ text: t.savedOk, bad: false }); load(); }}
                    onDeleted={() => { setMsg({ text: t.deleted, bad: false }); load(); }}
                    onError={(m) => setMsg({ text: m, bad: true })}
                  />
                </td>
              </tr>
              );
            })}
            {!shownGrns.length && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
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
