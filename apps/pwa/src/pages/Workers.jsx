import { useEffect, useState } from 'react';
import { useT, useLang } from '../i18n.js';
import { get, post, uuid, getRole } from '../api.js';
import { useTypes, typeLabel } from '../useTypes.js';
import RowActions, { useRowEdit } from '../components/RowActions.jsx';
import {
  Card, CardHeader, CardBody, Field, Input, Select, FormGrid, Button, Alert, Section, StatGrid, StatCard,
  Badge, TableCard, tbl, FilterInput, ClearFilters, Empty, cx,
} from '../components/ui.jsx';
import { PenLine, Plus } from 'lucide-react';

const blank = { dailyBricks: '', phone: '', reference: '', ratePerThousand: '', cutPerThousand: '', openingPeshgi: '', name: '', fatherName: '', cnic: '', dob: '', category: 'pathera', eobiNo: '', pessiNo: '' };
const COLS = ['name', 'fatherName', 'category', 'phone', 'peshgi', 'dailyBricks', 'contract', 'eobiNo', 'pessiNo'];

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
      const r = await post('/workers', { ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '')), clientUuid: uuid() });
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
  const value = (w, k) => (k === 'category' ? cats.label(w.category) || w.category : k === 'contract' ? (w.contractSigned ? t.signed : 'pending') : w[k]);
  const filteredList = list.filter((w) => COLS.every((k) => !filters[k] || String(value(w, k) || '').toLowerCase().includes(filters[k].toLowerCase())));
  const box = (k, extra = {}) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }), ...extra });

  return (
    <div className="grid gap-4">
      <Card className="p-4">
        <Section title={t.workers}>
          <StatGrid className="sm:grid-cols-3 lg:grid-cols-3">
            <StatCard label={t.workers} value={list.length} tone="orange" />
            <StatCard label={t.complianceGaps} value={`${unregistered} / ${list.length}`} tone={unregistered ? 'amber' : 'green'} />
            <StatCard label={t.signed} value={list.filter((w) => w.contractSigned).length} tone="green" />
          </StatGrid>
        </Section>
      </Card>

      <Card>
        <CardHeader title={`${t.add} ${t.worker}`} />
        <form onSubmit={add}>
          <CardBody>
            <FormGrid className="lg:grid-cols-3">
              <Field label={t.name}><Input required {...box('name')} /></Field>
              <Field label={t.fatherName}><Input required minLength={2} {...box('fatherName')} /></Field>
              <Field label={t.cnic}><Input required inputMode="numeric" placeholder="35201-1234567-1" {...box('cnic')} /></Field>
              <Field label={t.dob}><Input required type="date" {...box('dob')} /></Field>
              <Field label={t.category}>
                <Select {...box('category')}>{cats.active.map((c) => <option key={c.key} value={c.key}>{typeLabel(c, lang)}</option>)}</Select>
              </Field>
              <Field label={t.mobileNo}><Input required inputMode="tel" pattern="[0-9+\- ]{10,15}" placeholder="03xx-xxxxxxx" {...box('phone')} /></Field>
              <Field label={t.referenceJamadar}><Input {...box('reference')} /></Field>
              <Field label={t.ratePerThousand}><Input inputMode="decimal" placeholder={t.useKilnRate} {...box('ratePerThousand')} /></Field>
              <Field label={t.cutPerThousand}><Input inputMode="decimal" placeholder={t.useKilnRate} {...box('cutPerThousand')} /></Field>
              <Field label={t.openingPeshgi}><Input required inputMode="decimal" placeholder="0" {...box('openingPeshgi')} /></Field>
              <Field label={t.dailyBricks}><Input required inputMode="numeric" placeholder="1000" {...box('dailyBricks')} /></Field>
              <Field label={t.eobiNo}><Input {...box('eobiNo')} /></Field>
              <Field label={t.pessiNo}><Input {...box('pessiNo')} /></Field>
            </FormGrid>
            <Button type="submit" loading={submitting} className="justify-self-center sm:min-w-56"><Plus className="size-4 shrink-0" aria-hidden="true" /> {t.add} {t.worker}</Button>
            {msg.text && <Alert tone={msg.bad ? 'err' : 'ok'}>{msg.text}</Alert>}
          </CardBody>
        </form>
      </Card>

      <TableCard
        title={`${t.workers} (${filteredList.length} / ${list.length})`}
        actions={<ClearFilters show={Object.values(filters).some(Boolean)} onClick={() => setFilters({})} label={t.clearAll} />}
      >
        <table className={tbl.table}>
          <thead>
            <tr>
              <th className={cx('rownum', tbl.th)}>#</th>
              {[t.name, t.fatherName, t.category, t.mobileNo, t.peshgiBal, t.dailyBricks, t.contract, t.eobiNo, t.pessiNo].map((h, i) => <th key={i} className={cx(i === 0 && 'sticky-col', tbl.th)}>{h}</th>)}
              <th className={cx('actions', tbl.th)}>{t.action}</th>
            </tr>
            <tr className="filter-row">
              <th className={cx('rownum', tbl.fth)} />
              {COLS.map((k) => (
                <th key={k} className={cx(k === 'name' && 'sticky-col', tbl.fth)}>
                  <FilterInput aria-label={k} value={filters[k] || ''} onChange={(e) => setFilters({ ...filters, [k]: e.target.value })} />
                </th>
              ))}
              <th className={cx('actions', tbl.fth)} />
            </tr>
          </thead>
          <tbody>
            {filteredList.map((w, i) => {
              const editing = editor.isEditing(w._id);
              const cell = (k) => (editing ? <input className={tbl.cell} {...editor.field(k)} /> : (w[k] || <span className="text-n-400">—</span>));
              return (
                <tr key={w._id} className={cx(tbl.tr, editing && 'bg-amber-50!')}>
                  <td className={cx('rownum', tbl.td, 'text-n-500')}>{i + 1}</td>
                  <td className={cx('sticky-col', tbl.td, 'font-bold')}>{cell('name')}</td>
                  <td className={tbl.td}>{cell('fatherName')}</td>
                  <td className={tbl.td}>
                    {editing ? (
                      <select className={tbl.cell} {...editor.field('category')}>
                        {cats.active.map((c) => <option key={c.key} value={c.key}>{typeLabel(c, lang)}</option>)}
                      </select>
                    ) : <Badge tone="brand">{cats.label(w.category)}</Badge>}
                  </td>
                  <td className={cx(tbl.td, 'whitespace-nowrap')} dir="ltr">{cell('phone')}</td>
                  <td className={cx(tbl.td, 'font-bold', Number(w.peshgi) > 0 ? 'text-brand-700' : 'text-n-400')}>{Number(w.peshgi || 0).toLocaleString()}</td>
                  <td className={cx(tbl.td, 'font-semibold')}>{editing ? <input inputMode="numeric" className={tbl.cell} {...editor.field('dailyBricks')} /> : (w.dailyBricks ? Number(w.dailyBricks).toLocaleString() : <span className="text-n-400">—</span>)}</td>
                  <td className={tbl.td}>
                    {w.contractSigned
                      ? <Badge tone="ok">✓ {t.signed}</Badge>
                      : <Button size="sm" variant="secondary" className="min-h-8 text-xs" onClick={() => markSigned(w._id)}><PenLine className="size-4 shrink-0" aria-hidden="true" /> {t.markSigned}</Button>}
                  </td>
                  <td className={tbl.td}>{cell('eobiNo')}</td>
                  <td className={tbl.td}>{cell('pessiNo')}</td>
                  <td className={cx('actions', tbl.td)}>
                    <RowActions
                      editor={editor} id={w._id} path={`/workers/${w._id}`} name={w.name}
                      initial={{ name: w.name, fatherName: w.fatherName || '', category: w.category, phone: w.phone || '', dailyBricks: w.dailyBricks != null ? String(w.dailyBricks) : '', eobiNo: w.eobiNo || '', pessiNo: w.pessiNo || '' }}
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
            {!filteredList.length && <Empty cols={11}>{t.noEntries}</Empty>}
          </tbody>
        </table>
      </TableCard>
    </div>
  );
}
