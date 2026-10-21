import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, CheckCircle2, AlertCircle, UserRound, Save, Lock, LockOpen } from 'lucide-react';
import { useT, useLang } from '../i18n.js';
import { get, post, put, del, uuid, fmtDate, getRole } from '../api.js';
import { useTypes } from '../useTypes.js';
import SearchSelect from '../components/SearchSelect.jsx';
import { openQuick, useDataChanged, QUICK_KINDS, quickLabel, dataChanged } from '../components/QuickEntry.jsx';
import { Card, CardHeader, CardBody, Field, Input, MoneyInput, Button, Sheet, SectionTitle, Tabs, Skeleton, toast, cx } from '../components/ui.jsx';

const iso = (d) => d.toISOString().slice(0, 10);
const todayIso = () => iso(new Date());
const shift = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const n = (v) => Number(v || 0).toLocaleString();
const hm = (x) => new Date(x).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// how each kind of entry is listed, totalled, edited and erased
const KINDS = {
  moulding: { line: (r) => [r.who, `${n(r.count)}`], total: (rs) => n(rs.reduce((a, r) => a + r.count, 0)), del: (r) => `/moulding/${r._id}`,
    edit: { path: (r) => `/moulding/${r._id}`, fields: ['count'], init: (r) => ({ count: r.count }), body: (v, r, day) => ({ count: Number(v.count), date: day }) } },
  bharai: { line: (r) => [r.who, `${r.where} · ${n(r.count)}`], total: (rs) => n(rs.reduce((a, r) => a + r.count, 0)), del: (r) => `/section-loads/${r._id}`, ownerOnly: true,
    edit: { path: (r) => `/section-loads/${r._id}`, fields: ['count'], init: (r) => ({ count: r.count }), body: (v) => ({ count: Number(v.count) }) } },
  firing: { line: (r) => [r.who, `${r.lineIndex ? `#${r.lineIndex} · ` : ''}${n(r.coalKg)} kg · ${r.tempC}°C`], total: (rs) => `${n(rs.reduce((a, r) => a + r.coalKg, 0))} kg`, del: (r) => `/firing-logs/${r._id}`,
    edit: { path: (r) => `/firing-logs/${r._id}`, fields: ['coalKg', 'tempC'], init: (r) => ({ coalKg: r.coalKg, tempC: r.tempC }), body: (v) => ({ coalKg: Number(v.coalKg), tempC: Number(v.tempC) }) } },
  nikasi: { line: (r, t) => [r.who, `${r.where} · ${t.awwal} ${n(r.awwal)} · ${t.doem} ${n(r.doem)} · ${t.khangar} ${n(r.khangar)}`], total: (rs) => n(rs.reduce((a, r) => a + r.awwal + r.doem + r.khangar, 0)), del: (r) => `/unloadings/${r._id}`, ownerOnly: true,
    edit: { path: (r) => `/unloadings/${r._id}`, fields: ['awwal', 'doem', 'khangar', 'broken'], init: (r) => ({ awwal: r.awwal, doem: r.doem, khangar: r.khangar, broken: r.broken }),
      body: (v) => ({ awwal: Number(v.awwal || 0), doem: Number(v.doem || 0), khangar: Number(v.khangar || 0), broken: Number(v.broken || 0) }) } },
  dasti: { line: (r) => [r.who, n(r.amount)], total: (rs) => n(rs.reduce((a, r) => a + r.amount, 0)), del: (r) => `/kharcha/${r._id}`, ownerOnly: true },
  peshgi: { line: (r, t) => [r.who, `${r.kind === 'advance' ? t.advance : t.recovery} · ${n(r.amount)}`], total: (rs) => n(rs.filter((r) => r.kind === 'advance').reduce((a, r) => a + r.amount, 0)) },
  sale: { src: 'sales', line: (r, t) => [r.who, `${t[r.grade] || r.grade} ${n(r.qty)} · ${n(r.amount)}`], total: (rs) => n(rs.reduce((a, r) => a + r.amount, 0)), del: (r) => `/invoices/${r._id}`, ownerOnly: true,
    edit: { path: (r) => `/invoices/${r._id}`, fields: ['qty', 'rate'], init: (r) => ({ qty: r.qty, rate: r.rate }), body: (v) => ({ qty: Number(v.qty), rate: String(v.rate) }) } },
  payment: { src: 'payments', line: (r) => [r.who, `${r.mode} · ${n(r.amount)}`], total: (rs) => n(rs.reduce((a, r) => a + r.amount, 0)), del: (r) => `/payments/${r._id}`, ownerOnly: true,
    edit: { path: (r) => `/payments/${r._id}`, fields: ['amount'], init: (r) => ({ amount: r.amount }), body: (v) => ({ amount: String(v.amount) }) } },
  purchase: { src: 'purchases', line: (r) => [r.who, `${r.item} ${r.qty} · ${n(r.amount)}`], total: (rs) => n(rs.reduce((a, r) => a + r.amount, 0)), del: (r) => `/grns/${r._id}`, ownerOnly: true,
    edit: { path: (r) => `/grns/${r._id}`, fields: ['qty', 'rate'], init: (r) => ({ qty: r.qty, rate: r.rate }), body: (v) => ({ qty: Number(v.qty), rate: String(v.rate) }) } },
};

// Daily Entry: one screen for everything done on a day. Pick the day, see what is entered and what is
// missing, add with +, tap an entry to correct it, or open one worker's day card.
export default function DailyEntry() {
  const t = useT();
  const isOwner = getRole() === 'owner';
  const [day, setDay] = useState(todayIso());
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null); // { kind, row }
  const [locked, setLocked] = useState('');
  useEffect(() => { get('/settings').then((s) => setLocked(s.lockedUntil || '')).catch(() => {}); }, []);
  const isLocked = locked && day <= locked;
  const setLock = async (v) => {
    try { await put('/settings', { key: 'lockedUntil', value: v }); setLocked(v); toast(t.savedOk); } catch (e) { toast(e.message, 'err'); }
  };
  const load = useCallback(() => get(`/day?date=${day}`).then(setData).catch((e) => toast(e.message, 'err')), [day]);
  useEffect(() => { setData(null); load(); }, [load]);
  useDataChanged(load);

  const rowsOf = (k) => (data ? data[KINDS[k].src || k] || [] : []);
  async function erase(k, r) {
    if (!window.confirm(`${t.confirmDelete}: ${r.who}?`)) return;
    try { await del(KINDS[k].del(r)); toast(t.deleted); load(); } catch (e) { toast(e.message, 'err'); }
  }

  // what a complete day looks like: attendance taken, moulding entered, two firing shifts
  const a = data?.attendance;
  const checks = data ? [
    [t.attendance, a.marked >= a.active && a.active > 0, `${a.marked}/${a.active}`],
    [t.moulding, rowsOf('moulding').length > 0, rowsOf('moulding').length],
    [t.firing, rowsOf('firing').length >= 2, `${rowsOf('firing').length}/2`],
    [t.loadingBharai, rowsOf('bharai').length > 0, rowsOf('bharai').length],
  ] : [];
  const done = checks.filter((c) => c[1]).length;

  return (
    <div className="grid gap-4">
      {/* the day: ‹ date › */}
      <Card>
        <CardBody className="gap-3">
          <div className="flex items-center gap-2">
            <button type="button" aria-label={t.previous} onClick={() => setDay(shift(day, -1))} className="grid size-11 min-h-0 place-items-center rounded-xl border-0 bg-n-100 p-0 text-n-700 hover:bg-n-200"><ChevronLeft className="size-5 rtl:rotate-180" /></button>
            <div className="grid flex-1 place-items-center">
              <span className="text-xs font-semibold text-n-500">{t.dailyEntry}</span>
              <label className="relative cursor-pointer text-lg font-extrabold text-n-900">
                {fmtDate(day)}{day === todayIso() ? ` · ${t.wxToday}` : ''}
                <input type="date" max={todayIso()} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="absolute inset-0 min-h-0 cursor-pointer opacity-0" aria-label={t.date} />
              </label>
            </div>
            <button type="button" aria-label={t.next} disabled={day >= todayIso()} onClick={() => setDay(shift(day, 1))} className="grid size-11 min-h-0 place-items-center rounded-xl border-0 bg-n-100 p-0 text-n-700 hover:bg-n-200 disabled:opacity-40"><ChevronRight className="size-5 rtl:rotate-180" /></button>
          </div>
          {/* completeness: what is done and what is still missing for this day */}
          {data ? (
            <div className="grid gap-2">
              <div className="h-2 overflow-hidden rounded-full bg-n-100"><div className="h-full rounded-full bg-gain transition-[width] duration-500" style={{ width: `${(done / checks.length) * 100}%` }} /></div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {checks.map(([label, ok, val]) => (
                  <span key={label} className={cx('flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1', ok ? 'bg-green-50 text-gain ring-green-200' : 'bg-amber-50 text-caution ring-amber-200')}>
                    {ok ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
                    <span className="min-w-0 flex-1 truncate">{label}</span><b className="tabular-nums">{val}</b>
                  </span>
                ))}
              </div>
            </div>
          ) : <Skeleton className="h-16" />}
          {/* closing a day: after the owner closes it, staff cannot add or change its entries */}
          {(isLocked || isOwner) && (
            <div className={cx('flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ring-1', isLocked ? 'bg-slate-100 text-n-700 ring-slate-300' : 'bg-white text-n-600 ring-n-200')}>
              <span className="inline-flex items-center gap-1.5 font-semibold">{isLocked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}{isLocked ? t.dayClosed : t.dayOpen}</span>
              {isOwner && (isLocked
                ? <Button size="sm" variant="secondary" onClick={() => setLock(shift(day, -1))}><LockOpen className="size-4" /> {t.reopenDay}</Button>
                : <Button size="sm" variant="secondary" onClick={() => setLock(day)}><Lock className="size-4" /> {t.closeDay}</Button>)}
            </div>
          )}
        </CardBody>
      </Card>

      <WorkerDayCard t={t} day={day} data={data} onSaved={load} />

      {/* the day sheet: one block per kind of work, + to add, tap to correct */}
      <div className="grid gap-3 lg:grid-cols-2">
        {QUICK_KINDS.filter(([k]) => KINDS[k]).map(([k, Icon, color]) => {
          const rows = rowsOf(k);
          const K = KINDS[k];
          return (
            <Card key={k} className="overflow-hidden">
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${color} 14%, #fff)`, color }}><Icon className="size-5" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-md font-bold text-n-900">{quickLabel(t, k)}</div>
                  <div className="text-xs text-n-500">{data ? (rows.length ? `${rows.length} · ${K.total(rows)}` : t.noEntries) : '…'}</div>
                </div>
                <button type="button" aria-label={`${t.add} ${quickLabel(t, k)}`} onClick={() => openQuick(k, { date: day })}
                  className="grid size-10 min-h-0 place-items-center rounded-xl border-0 p-0 text-white hover:opacity-90" style={{ background: color }}>
                  <Plus className="size-5" aria-hidden="true" />
                </button>
              </div>
              {rows.length > 0 && (
                <ul className="m-0 list-none divide-y divide-n-100 border-t border-n-100 p-0">
                  {rows.map((r) => {
                    const [who, what] = K.line(r, t);
                    const canEdit = K.edit && (!K.ownerOnly || isOwner);
                    const canDel = K.del && (!K.ownerOnly || isOwner);
                    return (
                      <li key={r._id} className="flex items-center gap-2 px-3 py-2 odd:bg-white even:bg-zebra">
                        <span className="w-14 shrink-0 text-xs leading-tight text-n-400 tabular-nums">{hm(r.at)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-md font-semibold text-n-900">{who}</div>
                          <div className="truncate text-sm text-n-600 tabular-nums">{what}</div>
                        </div>
                        {canEdit && <button type="button" aria-label={t.edit} onClick={() => setEditing({ k, r })} className="grid size-8 min-h-0 place-items-center rounded-md border-0 bg-sky-50 p-0 text-sky-700 ring-1 ring-sky-200"><Pencil className="size-4" /></button>}
                        {canDel && <button type="button" aria-label={t.delete} onClick={() => erase(k, r)} className="grid size-8 min-h-0 place-items-center rounded-md border-0 bg-red-50 p-0 text-loss ring-1 ring-red-200"><Trash2 className="size-4" /></button>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      {editing && <EditSheet t={t} day={day} kind={editing.k} row={editing.r} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

// correct one entry in place (wages are corrected on the server, as on the other pages)
function EditSheet({ t, day, kind, row, onClose, onSaved }) {
  const E = KINDS[kind].edit;
  const [v, setV] = useState(E.init(row));
  const [busy, setBusy] = useState(false);
  const label = (f) => ({ count: t.count, coalKg: t.coalKg, tempC: t.tempC, qty: t.qty, rate: t.rate, amount: t.amount }[f] || t[f] || f);
  async function save() {
    setBusy(true);
    try { await put(E.path(row), E.body(v, row, day)); toast(t.savedOk); dataChanged(); onSaved(); } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  }
  return (
    <Sheet title={`${t.edit}: ${row.who}`} onClose={onClose}
      footer={<div className="grid grid-cols-2 gap-2"><Button variant="secondary" onClick={onClose}>{t.cancel}</Button><Button loading={busy} onClick={save}>{t.save}</Button></div>}>
      <div className="grid grid-cols-2 gap-3">
        {E.fields.map((f) => (
          <Field key={f} label={label(f)}><Input inputMode="decimal" value={v[f] ?? ''} onChange={(e) => setV({ ...v, [f]: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
        ))}
      </div>
    </Sheet>
  );
}

// One worker's whole day on one card: attendance, their work, dasti and peshgi.
const WORK = { pathera: 'moulding', bharai: 'bharai', nikasi: 'nikasi' };
function WorkerDayCard({ t, day, data, onSaved }) {
  const { lang } = useLang();
  const cats = useTypes('workerCategory');
  const [workers, setWorkers] = useState([]);
  const [id, setId] = useState('');
  const [f, setF] = useState({});
  const [busy, setBusy] = useState('');
  useEffect(() => { get('/workers').then((w) => setWorkers(w.filter((x) => x.status !== 'inactive').sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {}); }, []);
  useEffect(() => { setF({}); }, [id, day]);
  const w = workers.find((x) => x._id === id);
  const mark = data?.attendance.byWorker[id];
  const work = w && WORK[w.category];

  async function run(key, fn) {
    setBusy(key);
    try { await fn(); toast(t.savedOk); dataChanged(); onSaved(); } catch (e) { toast(e.message, 'err'); }
    setBusy('');
  }
  const setMark = (st) => run('att', () => put('/attendance', { date: day, entries: [{ workerId: id, status: st }] }));
  const saveWork = () => run('work', () => (work === 'moulding'
    ? post('/moulding', { workerId: id, count: Number(f.count), kharaba: 0, deductionPct: 2, date: day, clientUuid: uuid() })
    : post('/work-entries', { kind: work, workerId: id, date: day, count: Number(f.count), ...(work === 'nikasi' ? { grade: f.grade || 'awwal' } : {}), clientUuid: uuid() }))
    .then(() => setF((x) => ({ ...x, count: '' }))));
  const saveMoney = (path, k) => run(k, () => post(path, { workerId: id, amount: f[k], date: day, clientUuid: uuid() }).then(() => setF((x) => ({ ...x, [k]: '' }))));
  // this worker's entries today (matched by name, as lists show names)
  const mine = data && w ? ['moulding', 'bharai', 'nikasi', 'dasti', 'peshgi'].flatMap((k) => (data[k] || []).filter((r) => r.who === w.name || r.workerId === id || String(r.who).startsWith(`${w.name} —`)).map((r) => ({ ...r, k }))) : [];
  const MARKS = [['present', 'bg-gain'], ['absent', 'bg-loss'], ['leave', 'bg-amber-500'], ['half', 'bg-sky-600']];

  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><UserRound className="size-5 text-brand-600" aria-hidden="true" />{t.workerCard}</span>} />
      <CardBody>
        <SearchSelect ariaLabel={t.worker} placeholder={`${t.worker} — ${t.typeToSearch}`} value={id} onChange={setId}
          options={workers.map((x) => ({ value: x._id, label: `${x.fatherName ? `${x.name} — ${x.fatherName}` : x.name} (${cats.label(x.category)})`, search: `${x.cnic || ''} ${x.phone || ''}` }))} />
        {w && (
          <div className="grid gap-3">
            <div>
              <SectionTitle className="mb-2 text-sm">{t.attendance}</SectionTitle>
              <div className="grid grid-cols-4 gap-1.5">
                {MARKS.map(([st, bg]) => (
                  <button key={st} type="button" disabled={busy === 'att'} onClick={() => setMark(st)}
                    className={cx('min-h-10 rounded-lg border-0 text-sm font-bold ring-1', mark === st ? cx(bg, 'text-white ring-transparent') : 'bg-white text-n-700 ring-n-300')}>
                    {t[`att_${st}`]}
                  </button>
                ))}
              </div>
            </div>
            {work && (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                <Field label={`${quickLabel(t, work)} — ${t.bricksDone}`}>
                  <Input inputMode="numeric" placeholder="0" value={f.count || ''} onChange={(e) => setF({ ...f, count: e.target.value.replace(/[^\d]/g, '') })} />
                </Field>
                <Button loading={busy === 'work'} disabled={!Number(f.count)} onClick={saveWork}><Save className="size-4" /> {t.save}</Button>
                {work === 'nikasi' && <Tabs className="col-span-2" size="sm" options={['awwal', 'doem', 'khangar'].map((g) => [g, t[g]])} value={f.grade || 'awwal'} onChange={(g) => setF({ ...f, grade: g })} />}
              </div>
            )}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
              <Field label={t.dailyKharcha}><MoneyInput value={f.dasti || ''} onChange={(v) => setF({ ...f, dasti: v })} /></Field>
              <Button variant="secondary" loading={busy === 'dasti'} disabled={!Number(f.dasti)} onClick={() => saveMoney('/kharcha', 'dasti')}>{t.save}</Button>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
              <Field label={`${t.peshgi} (${t.advance})`}><MoneyInput value={f.peshgi || ''} onChange={(v) => setF({ ...f, peshgi: v })} /></Field>
              <Button variant="secondary" loading={busy === 'peshgi'} disabled={!Number(f.peshgi)} onClick={() => saveMoney('/advances', 'peshgi')}>{t.save}</Button>
            </div>
            {mine.length > 0 && (
              <ul className="m-0 grid list-none gap-1 rounded-lg bg-n-50 p-2 ring-1 ring-n-200">
                {mine.map((r) => <li key={r._id} className="flex justify-between gap-2 text-sm"><span className="text-n-600">{quickLabel(t, r.k)}</span><b className="tabular-nums">{n(r.count ?? r.amount ?? r.awwal)}</b></li>)}
              </ul>
            )}
            <span className="text-center text-xs text-n-500">{lang === 'ur' ? `پیشگی بقایا: ${n(w.peshgi)}` : `${t.peshgiBal}: ${n(w.peshgi)}`}</span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
