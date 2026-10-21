import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, post, uuid, fmtDateTime } from '../api.js';
import DateTime from '../components/DateTime.jsx';
import { useTypes, typeLabel } from '../useTypes.js';
import RowActions, { useRowEdit } from '../components/RowActions.jsx';
import { useLang } from '../i18n.js';
import { Card, CardHeader, CardBody, Field, Input, Select, FormGrid, Button, Alert, Badge, TableCard, tbl, FilterInput, Empty, cx } from '../components/ui.jsx';
import { Plus } from 'lucide-react';

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
  const [unloadings, setUnloadings] = useState([]);
  const [grns, setGrns] = useState([]);
  const [f, setF] = useState({ item: 'coal', supplierName: '', vehicleNo: '', description: '', qty: '', rate: '', freight: '0', date: new Date().toISOString().slice(0, 10) });
  const [lab, setLab] = useState({ calorificValue: '', ashPct: '', volatileMatterPct: '', silicaPct: '', aluminaPct: '', ironOxidePct: '' });
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState({});
  const setFilter = (k, v) => setFilters((f2) => ({ ...f2, [k]: v }));
  const has = (v, q) => !q || String(v ?? '').toLowerCase().includes(q.toLowerCase());
  const shownGrns = grns.filter((g) => has(fmtDateTime(g.date), filters.date) && has(items.label(g.item), filters.item)
    && has(g.supplierName, filters.supplier) && has(g.qty, filters.qty) && has(g.landedUnitCost, filters.cost));

  const load = () => {
    get('/unloadings').then(setUnloadings).catch(() => {});
    get('/grns').then(setGrns).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  async function submitGrn(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const labFields = Object.fromEntries(Object.entries(lab).filter(([, v]) => v !== ''));
      const isCoal = f.item === 'coal';
      // coal: vehicle + freight; other items: a description instead
      const body = isCoal ? { ...f, description: '' } : { ...f, vehicleNo: '', freight: '0' };
      const r = await post('/grns', { ...body, labFields: isCoal ? labFields : {}, clientUuid: uuid() });
      setMsg({ text: r.queued ? t.queued : `${t.savedOk} — ${t.landedCost}: ${r.landedUnitCost}`, bad: false });
      setF({ ...f, supplierName: '', vehicleNo: '', description: '', qty: '', rate: '' });
      setLab({ calorificValue: '', ashPct: '', volatileMatterPct: '', silicaPct: '', aluminaPct: '', ironOxidePct: '' });
      load();
    } catch (e2) {
      setMsg({ text: e2.message, bad: true });
    } finally {
      setSubmitting(false);
    }
  }

  const box = (k, extra = {}) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }), ...extra });
  const labBox = (k) => ({ value: lab[k], onChange: (e) => setLab({ ...lab, [k]: e.target.value }) });
  const coal = f.item === 'coal';

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title={t.grnTitle} />
        <form onSubmit={submitGrn}>
          <CardBody>
            <FormGrid className="lg:grid-cols-3">
              <Field label={t.item}>
                <Select value={f.item} onChange={(e) => (e.target.value === '__new' ? addItem() : setF({ ...f, item: e.target.value }))}>
                  {!items.active.some((i) => i.key === f.item) && <option value="" disabled>—</option>}
                  {items.active.map((i) => <option key={i.key} value={i.key}>{typeLabel(i, lang)}</option>)}
                  <option value="__new"><Plus className="size-4 shrink-0" aria-hidden="true" /> {t.addNewItem}</option>
                </Select>
              </Field>
              <Field label={t.supplier}><Input required {...box('supplierName')} /></Field>
              {coal
                ? <Field label={t.vehicle}><Input placeholder="LES-4920" {...box('vehicleNo')} /></Field>
                : <Field label={t.description}><Input placeholder={t.descriptionHint} {...box('description')} /></Field>}
              <Field label={t.quantity}><Input required inputMode="decimal" placeholder={t.qtyUnitsHint} {...box('qty')} /></Field>
              <Field label={t.rate}><Input required inputMode="decimal" {...box('rate')} /></Field>
              <Field label={t.entryDate}><Input type="date" required max={new Date().toISOString().slice(0, 10)} {...box('date')} /></Field>
              {coal && <Field label={t.freight}><Input inputMode="decimal" {...box('freight')} /></Field>}
            </FormGrid>

            {coal && (
              <details className="rounded-lg bg-n-50 px-3 py-2 ring-1 ring-n-200">
                <summary className="cursor-pointer text-sm font-semibold text-n-700">{t.labFieldsOptional}</summary>
                <FormGrid className="mt-3 lg:grid-cols-3">
                  <Field label={t.calorificValue}><Input inputMode="decimal" placeholder="kcal/kg" {...labBox('calorificValue')} /></Field>
                  <Field label={t.ashPct}><Input inputMode="decimal" placeholder="%" {...labBox('ashPct')} /></Field>
                  <Field label={t.volatileMatterPct}><Input inputMode="decimal" placeholder="%" {...labBox('volatileMatterPct')} /></Field>
                </FormGrid>
              </details>
            )}

            <Button type="submit" loading={submitting} className="justify-self-center sm:min-w-48"><Plus className="size-4 shrink-0" aria-hidden="true" /> {t.add}</Button>
            {msg.text && <Alert tone={msg.bad ? 'err' : 'ok'}>{msg.text}</Alert>}
          </CardBody>
        </form>
      </Card>

      <TableCard title={`${t.recentGrns} (${shownGrns.length} / ${grns.length})`}>
        <table className={tbl.table}>
          <thead>
            <tr>
              <th className={cx('rownum', tbl.th)}>#</th><th className={cx('sticky-col', tbl.th)}>{t.dateTime}</th>
              {[t.item, t.supplier, t.qty, t.landedCost].map((h) => <th key={h} className={tbl.th}>{h}</th>)}
              <th className={cx('actions', tbl.th)}>{t.action}</th>
            </tr>
            <tr className="filter-row">
              <th className={cx('rownum', tbl.fth)} />
              {['date', 'item', 'supplier', 'qty', 'cost'].map((k) => (
                <th key={k} className={tbl.fth}><FilterInput aria-label={k} value={filters[k] || ''} onChange={(e) => setFilter(k, e.target.value)} /></th>
              ))}
              <th className={cx('actions', tbl.fth)} />
            </tr>
          </thead>
          <tbody>
            {shownGrns.map((g, i) => {
              const editing = editor.isEditing(g._id);
              return (
                <tr key={g._id} className={cx(tbl.tr, editing && 'bg-amber-50!')}>
                  <td className={cx('rownum', tbl.td, 'text-n-500')}>{i + 1}</td>
                  <td className={tbl.td}><DateTime value={g.date} /></td>
                  <td className={tbl.td}>
                    <Badge>{items.label(g.item)}</Badge>
                    {g.description ? <div className="mt-0.5 text-xs text-n-500">{g.description}</div> : null}
                  </td>
                  <td className={cx(tbl.td, 'font-semibold')}>{editing ? <input className={tbl.cell} {...editor.field('supplierName')} /> : g.supplierName}</td>
                  <td className={tbl.td}>{editing ? <input inputMode="decimal" className={tbl.cell} {...editor.field('qty')} /> : g.qty}</td>
                  <td className={cx(tbl.td, 'text-end font-bold')}>{editing ? <input inputMode="decimal" className={tbl.cell} title={t.rate} {...editor.field('rate')} /> : Number(g.landedUnitCost).toLocaleString()}</td>
                  <td className={cx('actions', tbl.td)}>
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
            {!shownGrns.length && <Empty cols={7}>{t.noEntries}</Empty>}
          </tbody>
        </table>
      </TableCard>
    </div>
  );
}
