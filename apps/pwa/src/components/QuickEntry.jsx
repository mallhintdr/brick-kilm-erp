import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Hammer, Layers, Flame, PackageOpen, Wallet, HandCoins, Receipt, Banknote, Truck, CalendarCheck, Plus,
} from 'lucide-react';
import { useT, useLang } from '../i18n.js';
import { get, post, uuid } from '../api.js';
import { useTypes, typeLabel } from '../useTypes.js';
import SearchSelect from './SearchSelect.jsx';
import { Sheet, Field, Input, Select, MoneyInput, FormGrid, Button, Tabs, toast, cx } from './ui.jsx';

// Quick entry: one small form per kiln operation, opened in a sliding panel from anywhere
// (the + button, the Daily Entry page, a worker's day card). "Save & next" keeps it open for the next one.
export const openQuick = (kind, preset = {}) => window.dispatchEvent(new CustomEvent('quick-open', { detail: { kind, preset } }));
export const dataChanged = () => window.dispatchEvent(new Event('app-data-changed'));
export const useDataChanged = (fn) => useEffect(() => { window.addEventListener('app-data-changed', fn); return () => window.removeEventListener('app-data-changed', fn); }, [fn]);

export const QUICK_KINDS = [
  ['moulding', Hammer, '#d97706'], ['bharai', Layers, '#2563eb'], ['firing', Flame, '#dc2626'], ['nikasi', PackageOpen, '#16a34a'],
  ['dasti', Wallet, '#7c3aed'], ['peshgi', HandCoins, '#c2410c'], ['sale', Receipt, '#db2777'], ['payment', Banknote, '#059669'],
  ['purchase', Truck, '#0284c7'], ['attendance', CalendarCheck, '#0f766e'],
];
const today = () => new Date().toISOString().slice(0, 10);
const pkTime = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(11, 16);

// labels for each quick form (from the existing page names)
export const quickLabel = (t, k) => ({
  moulding: t.moulding, bharai: t.loadingBharai, firing: t.firing, nikasi: t.unloadingNikasi, dasti: t.dailyKharcha,
  peshgi: t.peshgi, sale: t.newInvoice, payment: t.recordPayment, purchase: t.grnTitle, attendance: t.attendance,
}[k] || k);

export function QuickEntryHost() {
  const t = useT();
  const nav = useNavigate();
  const [open, setOpen] = useState(null); // { kind, preset }
  useEffect(() => {
    const on = (e) => {
      if (e.detail.kind === 'attendance') { nav('/attendance'); setOpen(null); return; }
      setOpen(e.detail);
    };
    window.addEventListener('quick-open', on);
    return () => window.removeEventListener('quick-open', on);
  }, [nav]);
  if (!open) return null;
  const close = () => setOpen(null);
  if (open.kind === 'menu') {
    return (
      <Sheet title={t.quickAdd} onClose={close}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {QUICK_KINDS.map(([k, Icon, color]) => (
            <button key={k} type="button" onClick={() => openQuick(k, open.preset)}
              className="flex min-h-16 items-center gap-2.5 rounded-xl border-0 bg-white px-3 text-start text-md font-semibold text-n-900 ring-1 ring-n-200 hover:bg-n-50">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${color} 14%, #fff)`, color }}><Icon className="size-5" aria-hidden="true" /></span>
              <span className="leading-tight">{quickLabel(t, k)}</span>
            </button>
          ))}
        </div>
      </Sheet>
    );
  }
  return <QuickForm key={open.kind} kind={open.kind} preset={open.preset || {}} onClose={close} />;
}

// reference data for the forms, loaded once per open
function useRefs() {
  const [r, setR] = useState({ workers: [], teams: [], customers: [], lines: [], invoices: [], unit: 'line' });
  useEffect(() => {
    Promise.all([
      get('/workers').catch(() => []), get('/teams').catch(() => []), get('/customers').catch(() => []),
      get('/settings').catch(() => ({})), get('/invoices').catch(() => []),
    ]).then(async ([workers, teams, customers, settings, invoices]) => {
      const unit = settings.kilnUnit === 'chamber' ? 'chamber' : 'line';
      const lines = await get(unit === 'line' ? '/kiln-lines' : '/kiln-sections').catch(() => []);
      setR({ workers: workers.filter((w) => w.status !== 'inactive').sort((a, b) => a.name.localeCompare(b.name)), teams, customers, lines, invoices, unit });
    });
  }, []);
  return r;
}

function QuickForm({ kind, preset, onClose }) {
  const t = useT();
  const { lang } = useLang();
  const refs = useRefs();
  const items = useTypes('procurementItem');
  const payModes = useTypes('paymentMode');
  const [f, setF] = useState({ date: preset.date || today(), ...(kind === 'purchase' ? { item: 'coal' } : {}), ...(kind === 'moulding' ? { deductionPct: '2' } : {}), ...preset });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const workersOf = (cat) => refs.workers.filter((w) => !cat || w.category === cat)
    .map((w) => ({ value: w._id, label: w.fatherName ? `${w.name} — ${w.fatherName}` : w.name, search: `${w.cnic || ''} ${w.phone || ''}` }));
  const linePath = refs.unit === 'line' ? '/kiln-lines' : '/kiln-sections';
  const lineWord = refs.unit === 'line' ? t.line : t.section;
  const linesIn = (...states) => refs.lines.filter((l) => states.includes(l.state) || (states.includes('CoolingHand') && l.stage === 'Cooling'));
  const dateBox = <Field label={t.entryDate}><Input type="date" required max={today()} value={f.date} onChange={set('date')} /></Field>;

  // defaults that depend on loaded data: next empty line, the line on fire
  useEffect(() => {
    if (!refs.lines.length) return;
    if (kind === 'bharai' && !f.line) setF((x) => ({ ...x, line: String(linesIn('Empty')[0]?.index || '') }));
    if (kind === 'firing' && !f.line) setF((x) => ({ ...x, line: String(refs.lines.find((l) => l.state === 'Firing')?.index || '') }));
    if (kind === 'firing' && !f.time) setF((x) => ({ ...x, time: pkTime(), shift: x.shift || 'day' }));
  }, [refs.lines.length]);

  // each form: the request(s) to send, and which boxes to clear for "next"
  const SPEC = {
    moulding: {
      ok: f.workerId && Number(f.count) > 0,
      send: () => post('/moulding', { workerId: f.workerId, count: Number(f.count), kharaba: 0, deductionPct: Number(f.deductionPct ?? 2), quality: f.quality || 'good', date: f.date, clientUuid: uuid() }),
      clear: { workerId: '', count: '' },
    },
    bharai: {
      ok: f.line && f.workerId && Number(f.count) > 0,
      send: () => post(`${linePath}/${f.line}/load`, { workerId: f.workerId, count: Number(f.count), date: f.date, clientUuid: uuid() }),
      // next line, same loader
      clear: { line: String(linesIn('Empty').map((l) => l.index).find((i) => i > Number(f.line)) || ''), count: f.count },
    },
    firing: {
      ok: f.workerId && f.coalKg && f.tempC,
      send: () => post('/firing-logs', { workerIds: [f.workerId], shift: f.shift || 'day', coalKg: Number(f.coalKg), tempC: Number(f.tempC), lineIndex: f.line ? Number(f.line) : undefined, time: f.time || undefined, date: f.date, genHours: 0, fanOn: true, clientUuid: uuid() }),
      clear: { coalKg: '', tempC: '', time: pkTime() },
    },
    nikasi: {
      ok: f.line && (Number(f.awwal) || Number(f.doem) || Number(f.khangar) || Number(f.broken)) && (f.workerId || refs.lines.find((l) => String(l.index) === String(f.line))?.state === 'Unloading'),
      send: async () => {
        const line = refs.lines.find((l) => String(l.index) === String(f.line));
        if (line?.state !== 'Unloading') await post(`${linePath}/${f.line}/unload/start`, { workerId: f.workerId, date: f.date, clientUuid: uuid() });
        return post(`${linePath}/${f.line}/unload/complete`, { awwal: Number(f.awwal || 0), doem: Number(f.doem || 0), khangar: Number(f.khangar || 0), broken: Number(f.broken || 0), date: f.date, clientUuid: uuid() });
      },
      clear: { line: '', awwal: '', doem: '', khangar: '', broken: '' },
    },
    dasti: {
      ok: f.workerId && Number(f.amount) > 0,
      send: () => post('/kharcha', { workerId: f.workerId, amount: f.amount, date: f.date, clientUuid: uuid() }),
      clear: { workerId: '', amount: '' },
    },
    peshgi: {
      ok: f.workerId && Number(f.amount) > 0,
      send: () => post(f.dir === 'recovery' ? '/recoveries' : '/advances', { workerId: f.workerId, amount: f.amount, date: f.date, clientUuid: uuid() }),
      clear: { workerId: '', amount: '' },
    },
    sale: {
      ok: f.customerId && Number(f.qty) > 0,
      send: () => post('/invoices', { customerId: f.customerId, grade: f.grade || 'awwal', qty: Number(f.qty), taxPct: f.taxPct || '0', date: f.date, clientUuid: uuid() }),
      clear: { qty: '' },
    },
    payment: {
      ok: f.invoiceId && Number(f.amount) > 0,
      send: () => post('/payments', { invoiceId: f.invoiceId, amount: f.amount, mode: f.mode || 'cash', date: f.date, clientUuid: uuid() }),
      clear: { invoiceId: '', amount: '' },
    },
    purchase: {
      ok: f.item && f.supplierName && Number(f.qty) > 0 && Number(f.rate) > 0,
      send: () => post('/grns', { item: f.item, supplierName: f.supplierName, qty: f.qty, rate: f.rate, freight: f.item === 'coal' ? (f.freight || '0') : '0',
        vehicleNo: f.item === 'coal' ? f.vehicleNo : '', description: f.item === 'coal' ? '' : f.description, date: f.date, clientUuid: uuid() }),
      clear: { qty: '', rate: '', vehicleNo: '', description: '' },
    },
  }[kind];

  async function save(next) {
    setBusy(true);
    try {
      const r = await SPEC.send();
      toast(r?.queued ? t.queued : t.savedOk);
      dataChanged();
      if (next) {
        setF((x) => ({ ...x, ...SPEC.clear }));
        // the lines changed: reload them so the next empty line / states are right
        if (['bharai', 'nikasi', 'firing'].includes(kind)) get(linePath).then((l) => { refs.lines.splice(0, refs.lines.length, ...l); }).catch(() => {});
      } else onClose();
    } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  }

  const unpaid = useMemo(() => refs.invoices.filter((i) => i.status !== 'paid'), [refs.invoices]);
  const cname = (id) => refs.customers.find((c) => c._id === id)?.name || '—';
  const num = (k, label, ph) => <Field label={label}><Input inputMode="numeric" placeholder={ph} value={f[k] || ''} onChange={(e) => set(k)(e.target.value.replace(/[^\d.]/g, ''))} /></Field>;

  let body = null;
  if (kind === 'moulding') {
    body = (
      <FormGrid>
        <Field label={t.moulderOrTeam} className="sm:col-span-2"><SearchSelect required ariaLabel={t.moulderOrTeam} placeholder={t.typeToSearch} value={f.workerId || ''} onChange={set('workerId')} options={workersOf('pathera')} /></Field>
        {num('count', t.count, '10000')}
        {num('deductionPct', t.deductionPct, '2')}
        <Field label={t.quality}>
          <Select value={f.quality || 'good'} onChange={set('quality')}><option value="good">{t.qGood}</option><option value="satisfactory">{t.qSatisfactory}</option><option value="poor">{t.qPoor}</option></Select>
        </Field>
        {dateBox}
      </FormGrid>
    );
  } else if (kind === 'bharai') {
    body = (
      <FormGrid>
        <Field label={`${lineWord} (${t.empty})`}>
          <Select value={f.line || ''} onChange={set('line')}><option value="">—</option>{linesIn('Empty').map((l) => <option key={l.index} value={l.index}>{lineWord} {l.index}</option>)}</Select>
        </Field>
        {num('count', t.kachiBharai, '4200')}
        <Field label={t.loaderOrTeam} className="sm:col-span-2"><SearchSelect required ariaLabel={t.loaderOrTeam} placeholder={t.typeToSearch} value={f.workerId || ''} onChange={set('workerId')} options={workersOf('bharai')} /></Field>
        {dateBox}
      </FormGrid>
    );
  } else if (kind === 'firing') {
    body = (
      <FormGrid>
        <Field label={t.fireman} className="sm:col-span-2"><SearchSelect required ariaLabel={t.fireman} placeholder={t.typeToSearch} value={f.workerId || ''} onChange={set('workerId')} options={workersOf('jalai')} /></Field>
        <Field label={t.shift}><Tabs options={[['day', t.day], ['night', t.night]]} value={f.shift || 'day'} onChange={set('shift')} /></Field>
        <Field label={t.lineNo}>
          <Select value={f.line || ''} onChange={set('line')}>
            <option value="">—</option>
            {refs.lines.filter((l) => ['Firing', 'Preheating', 'Loading'].includes(l.state)).map((l) => <option key={l.index} value={l.index}>{l.index}{l.state === 'Firing' ? ' 🔥' : ''}</option>)}
          </Select>
        </Field>
        {num('coalKg', t.coalKg, '1200')}
        {num('tempC', t.tempC, '950')}
        {dateBox}
        <Field label={t.time}><Input type="time" value={f.time || ''} onChange={set('time')} /></Field>
      </FormGrid>
    );
  } else if (kind === 'nikasi') {
    const chosen = refs.lines.find((l) => String(l.index) === String(f.line));
    body = (
      <FormGrid>
        <Field label={`${lineWord} (${t.readyToUnload})`}>
          <Select value={f.line || ''} onChange={set('line')}>
            <option value="">—</option>
            {linesIn('Ready', 'Unloading', 'CoolingHand').map((l) => <option key={l.index} value={l.index}>{lineWord} {l.index}{l.state === 'Unloading' ? ` — ${t.unloading}` : ''}</option>)}
          </Select>
        </Field>
        {dateBox}
        {chosen?.state !== 'Unloading' && (
          <Field label={t.unloaderOrTeam} className="sm:col-span-2"><SearchSelect required ariaLabel={t.unloaderOrTeam} placeholder={t.typeToSearch} value={f.workerId || ''} onChange={set('workerId')} options={workersOf('nikasi')} /></Field>
        )}
        <div className="grid grid-cols-4 gap-2 sm:col-span-2">
          {['awwal', 'doem', 'khangar', 'broken'].map((k) => <Field key={k} label={t[k]}><Input inputMode="numeric" placeholder="0" value={f[k] || ''} onChange={(e) => set(k)(e.target.value.replace(/[^\d]/g, ''))} /></Field>)}
        </div>
      </FormGrid>
    );
  } else if (kind === 'dasti' || kind === 'peshgi') {
    body = (
      <FormGrid>
        {kind === 'peshgi' && <Tabs className="sm:col-span-2" options={[['advance', t.advance], ['recovery', t.recovery]]} value={f.dir || 'advance'} onChange={set('dir')} />}
        <Field label={t.worker} className="sm:col-span-2"><SearchSelect required ariaLabel={t.worker} placeholder={t.typeToSearch} value={f.workerId || ''} onChange={set('workerId')} options={workersOf()} /></Field>
        <Field label={t.amount}><MoneyInput required value={f.amount || ''} onChange={set('amount')} /></Field>
        {dateBox}
      </FormGrid>
    );
  } else if (kind === 'sale') {
    body = (
      <FormGrid>
        <Field label={t.customer} className="sm:col-span-2">
          <SearchSelect required ariaLabel={t.customer} placeholder={t.typeToSearch} value={f.customerId || ''} onChange={set('customerId')}
            options={refs.customers.map((c) => ({ value: c._id, label: c.name, search: c.phone || '' }))} />
        </Field>
        <Field label={t.grade}><Select value={f.grade || 'awwal'} onChange={set('grade')}><option value="awwal">{t.awwal}</option><option value="doem">{t.doem}</option><option value="khangar">{t.khangar}</option></Select></Field>
        {num('qty', t.quantity, '10000')}
        {num('taxPct', `${t.taxPct} (%)`, '0')}
        {dateBox}
      </FormGrid>
    );
  } else if (kind === 'payment') {
    body = (
      <FormGrid>
        <Field label={t.unpaidInvoices} className="sm:col-span-2">
          <SearchSelect required ariaLabel={t.invoice} placeholder={t.typeToSearch} value={f.invoiceId || ''}
            onChange={(v) => { const inv = unpaid.find((i) => i._id === v); setF((x) => ({ ...x, invoiceId: v, amount: String(inv?.balance ?? inv?.amount ?? '') })); }}
            options={unpaid.map((i) => ({ value: i._id, label: `${cname(i.customerId)} — ${t[i.grade] || i.grade} ${Number(i.qty).toLocaleString()} — ${Number(i.balance ?? i.amount).toLocaleString()}` }))} />
        </Field>
        <Field label={t.amount}><MoneyInput required value={f.amount || ''} onChange={set('amount')} /></Field>
        <Field label={t.mode}><Select value={f.mode || 'cash'} onChange={set('mode')}>{payModes.active.map((m) => <option key={m.key} value={m.key}>{typeLabel(m, lang)}</option>)}</Select></Field>
        {dateBox}
      </FormGrid>
    );
  } else if (kind === 'purchase') {
    const coal = (f.item || 'coal') === 'coal';
    body = (
      <FormGrid>
        <Field label={t.item}><Select value={f.item || 'coal'} onChange={set('item')}>{items.active.map((i) => <option key={i.key} value={i.key}>{typeLabel(i, lang)}</option>)}</Select></Field>
        <Field label={t.supplier}><Input required value={f.supplierName || ''} onChange={set('supplierName')} /></Field>
        {num('qty', t.quantity, t.qtyUnitsHint)}
        {num('rate', t.rate, '')}
        {coal ? <Field label={t.vehicle}><Input value={f.vehicleNo || ''} onChange={set('vehicleNo')} /></Field> : <Field label={t.description}><Input value={f.description || ''} onChange={set('description')} /></Field>}
        {coal && num('freight', t.freight, '0')}
        {dateBox}
      </FormGrid>
    );
  }

  return (
    <Sheet title={quickLabel(t, kind)} onClose={onClose}
      footer={(
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" loading={busy} disabled={!SPEC?.ok} onClick={() => save(true)}><Plus className="size-4" aria-hidden="true" /> {t.saveNext}</Button>
          <Button loading={busy} disabled={!SPEC?.ok} onClick={() => save(false)}>{t.save}</Button>
        </div>
      )}>
      {body}
    </Sheet>
  );
}

// round + button that opens the quick-add menu (phones: in the tab bar; desktop: bottom corner)
export function QuickAddFab({ className }) {
  const t = useT();
  return (
    <button type="button" aria-label={t.quickAdd} title={t.quickAdd} onClick={() => openQuick('menu')}
      className={cx('grid size-14 place-items-center rounded-full border-0 bg-brand-600 text-white shadow-[0_6px_18px_rgba(234,88,12,.45)] hover:bg-brand-700 active:scale-95', className)}>
      <Plus className="size-7" aria-hidden="true" />
    </button>
  );
}
