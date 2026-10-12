import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, post, uuid, fmtDateTime } from '../api.js';
import { useTypes, typeLabel } from '../useTypes.js';
import DeleteButton from '../components/DeleteButton.jsx';
import { useLang } from '../i18n.js';

export default function Inventory() {
  const t = useT();
  const { lang } = useLang();
  const items = useTypes('procurementItem');
  const [summary, setSummary] = useState(null);
  const [unloadings, setUnloadings] = useState([]);
  const [grns, setGrns] = useState([]);
  const [f, setF] = useState({ item: 'coal', supplierName: '', vehicleNo: '', qty: '', rate: '', freight: '0' });
  const [lab, setLab] = useState({ calorificValue: '', ashPct: '', volatileMatterPct: '', silicaPct: '', aluminaPct: '', ironOxidePct: '' });
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [submitting, setSubmitting] = useState(false);

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
              🧱 Manufactured Brick Stock by Grade (اینٹوں کا ذخیرہ)
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
              ⚡ Fuel & Raw Material Storage (ایندھن اور کوئلہ ذخیرہ)
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
        <h2>🚚 {t.grnTitle} — Goods Receipt Note</h2>

        <div className="grid two" style={{ gap: '0.85rem' }}>
          <label>
            {t.item}
            <select value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })}>
              {items.active.map((i) => (
                <option key={i.key} value={i.key}>{typeLabel(i, lang)}</option>
              ))}
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
            {t.qty} (Tonnes / Units)
            <input required inputMode="decimal" placeholder="Quantity" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
          </label>

          <label>
            {t.rate}
            <input required inputMode="decimal" placeholder="Price rate" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} />
          </label>

          <label>
            {t.freight}
            <input inputMode="decimal" placeholder="Freight / Kiraya" value={f.freight} onChange={(e) => setF({ ...f, freight: e.target.value })} />
          </label>
        </div>

        {/* Optional Lab Tests */}
        {f.item === 'coal' && (
          <div style={{ padding: '0.85rem 1rem', background: '#f8fafc', borderRadius: '10px', border: '1.5px solid var(--line)' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
              🔬 {t.labFieldsOptional} (Coal Quality Parameters)
            </div>
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
          </div>
        )}

        {f.item === 'soil' && (
          <div style={{ padding: '0.85rem 1rem', background: '#f8fafc', borderRadius: '10px', border: '1.5px solid var(--line)' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
              🔬 {t.labFieldsOptional} (Soil Composition)
            </div>
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
          </div>
        )}

        <button className="primary" disabled={submitting}>
          ➕ {t.add} GRN
        </button>

        {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>{msg.text}</p>}
      </form>

      {/* Recent GRN Purchases Table with Column Outlines */}
      <div className="card table-wrap">
        <h2>📋 {t.recentGrns} ({grns.length})</h2>
        <table>
          <thead>
            <tr>
              <th className="rownum">#</th>
              <th>{t.dateTime}</th>
              <th>{t.item}</th>
              <th>{t.supplier}</th>
              <th>{t.qty}</th>
              <th style={{ textAlign: 'end' }}>{t.landedCost}</th>
              <th className="actions" />
            </tr>
          </thead>
          <tbody>
            {grns.map((g, i) => (
              <tr key={g._id}>
                <td className="rownum">{i + 1}</td>
                <td>{fmtDateTime(g.date)}</td>
                <td>
                  <span className="badge" style={{ background: '#f1f5f9', color: '#1e293b' }}>
                    {items.label(g.item)}
                  </span>
                </td>
                <td><strong>{g.supplierName}</strong></td>
                <td>{g.qty}</td>
                <td style={{ textAlign: 'end' }}><strong>{Number(g.landedUnitCost).toLocaleString()}</strong></td>
                <td className="actions">
                  <DeleteButton
                    path={`/grns/${g._id}`}
                    name={`${items.label(g.item)} — ${g.supplierName}`}
                    onDone={() => { setMsg({ text: t.deleted, bad: false }); load(); }}
                    onError={(m) => setMsg({ text: m, bad: true })}
                  />
                </td>
              </tr>
            ))}
            {!grns.length && (
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
