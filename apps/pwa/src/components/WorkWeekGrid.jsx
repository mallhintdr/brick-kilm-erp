import { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n.js';
import { get, post, uuid, fmtDate } from '../api.js';
import { Button, Alert, Tabs, IconButton, tbl, cx } from './ui.jsx';
import { Save } from 'lucide-react';

const iso = (d) => d.toISOString().slice(0, 10);
const todayIso = () => iso(new Date());
// kiln weeks run Saturday -> Friday, as in moulding
const weekStartOf = (s) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7)); return iso(d); };
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

// Weekly entry for bharai (kind="bharai") or nikasi (kind="nikasi"): workers x Saturday-Friday.
// Days already recorded show their total; empty days take new counts, saved in one go.
export default function WorkWeekGrid({ kind, open = false }) {
  const t = useT();
  const category = kind;
  const [weekStart, setWeekStart] = useState(weekStartOf(todayIso()));
  const [grade, setGrade] = useState('awwal');
  const [workers, setWorkers] = useState([]);
  const [saved, setSaved] = useState({}); // workerId|date -> count
  const [grid, setGrid] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: '', bad: false });
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  useEffect(() => { get('/workers').then((w) => setWorkers(w.filter((x) => x.category === category && x.status !== 'inactive').sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {}); }, [category]);
  const loadSaved = () => get(`/work-week?kind=${kind}&from=${days[0]}&to=${days[6]}${kind === 'nikasi' ? `&grade=${grade}` : ''}`)
    .then((rows) => setSaved(Object.fromEntries(rows.map((r) => [`${r.workerId}|${r.date}`, r.count])))).catch(() => setSaved({}));
  useEffect(() => { loadSaved(); }, [weekStart, grade, kind]);

  const val = (w, d) => saved[`${w}|${d}`] ?? (Number(grid[w]?.[d]) || 0);
  const rowTotal = (w) => days.reduce((a, d) => a + val(w, d), 0);
  const dayTotal = (d) => workers.reduce((a, w) => a + val(w._id, d), 0);
  const newCells = workers.flatMap((w) => days.filter((d) => saved[`${w._id}|${d}`] == null && Number(grid[w._id]?.[d]) > 0).map((d) => ({ w: w._id, d, count: Number(grid[w._id][d]) })));

  async function saveWeek() {
    setBusy(true);
    let ok = 0; const failed = [];
    for (const c of newCells) {
      try {
        if (kind === 'pathera') await post('/moulding', { workerId: c.w, date: c.d, count: c.count, kharaba: 0, deductionPct: 2, clientUuid: uuid() });
        else await post('/work-entries', { kind, workerId: c.w, date: c.d, count: c.count, ...(kind === 'nikasi' ? { grade } : {}), clientUuid: uuid() });
        ok++;
        setGrid((g) => ({ ...g, [c.w]: { ...g[c.w], [c.d]: '' } }));
      } catch (e) { failed.push(`${fmtDate(c.d)}: ${e.message}`); }
    }
    setBusy(false);
    setMsg(failed.length ? { text: `${ok} ${t.savedOk}; ${failed.join(' | ')}`, bad: true } : { text: `${ok} ${t.savedOk}`, bad: false });
    loadSaved();
  }

  return (
    <details open={open} className="group overflow-hidden rounded-lg bg-white ring-1 ring-n-200 shadow-[0_1px_2px_rgba(28,25,23,.05)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
        <h2 className="m-0 text-lg font-bold text-n-900">{t.weeklyEntry} — {kind === 'bharai' ? t.loadingBharai : kind === 'pathera' ? t.moulding : t.unloadingNikasi}</h2>
        <span className="text-n-500 transition group-open:rotate-180" aria-hidden="true">▾</span>
      </summary>
      <div className="grid gap-3 border-t border-n-100 p-4">
        <WeekNav t={t} days={days} onPrev={() => setWeekStart(addDays(weekStart, -7))} onNext={() => setWeekStart(addDays(weekStart, 7))} />
        {kind === 'nikasi' && <Tabs options={['awwal', 'doem', 'khangar'].map((g) => [g, t[g]])} value={grade} onChange={setGrade} />}
        <div className="table-wrap overflow-x-auto rounded-lg ring-1 ring-n-200">
          <table className={cx(tbl.table, 'text-sm')}>
            <thead>
              <tr>
                <th className={cx('sticky-col', tbl.th)}>{t.name}</th>
                {days.map((d) => <th key={d} className={tbl.th}>{fmtDate(d).slice(0, 5)}</th>)}
                <th className={tbl.th}>{t.total}</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w._id} className={tbl.tr}>
                  <td className={cx(tbl.td, 'px-2 text-start font-semibold')}>{w.name}</td>
                  {days.map((d) => {
                    const sv = saved[`${w._id}|${d}`];
                    if (sv != null) return <td key={d} className={cx(tbl.td, 'bg-green-50! px-1 font-semibold text-gain')}>{sv.toLocaleString()}</td>;
                    return (
                      <td key={d} className={cx(tbl.td, 'px-1')}>
                        <input inputMode="numeric" aria-label={`${w.name} ${d}`} disabled={d > todayIso()}
                          className="mx-auto block h-8 min-h-0 w-16 rounded-md border-0 bg-white px-1 text-center text-sm ring-1 ring-n-300 outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-n-100"
                          value={grid[w._id]?.[d] ?? ''} onChange={(e) => setGrid((g) => ({ ...g, [w._id]: { ...(g[w._id] || {}), [d]: e.target.value.replace(/[^\d]/g, '') } }))} />
                      </td>
                    );
                  })}
                  <td className={cx(tbl.td, 'font-bold')}>{rowTotal(w._id).toLocaleString()}</td>
                </tr>
              ))}
              {!workers.length && <tr><td colSpan={9} className="px-3 py-6 text-center text-sm text-n-500">{t.noWorkersInCategory}</td></tr>}
            </tbody>
            <tfoot>
              <tr className="bg-n-100 font-bold">
                <td className={tbl.td}>{t.total}</td>
                {days.map((d) => <td key={d} className={tbl.td}>{dayTotal(d).toLocaleString()}</td>)}
                <td className={tbl.td}>{workers.reduce((a, w) => a + rowTotal(w._id), 0).toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <Button loading={busy} disabled={!newCells.length} onClick={saveWeek} className="justify-self-center sm:min-w-48"><Save className="size-4 shrink-0" aria-hidden="true" /> {t.saveWeek}</Button>
        {msg.text && <Alert tone={msg.bad ? 'err' : 'ok'}>{msg.text}</Alert>}
      </div>
    </details>
  );
}

// ‹  From 12-10-2026  To 18-10-2026  ›  (shared by the weekly grids)
export function WeekNav({ t, days, onPrev, onNext }) {
  return (
    <div className="flex items-center justify-center gap-2">
      <IconButton label="Previous week" onClick={onPrev} className="ring-1 ring-n-300 bg-white text-lg">‹</IconButton>
      <div className="grid grid-cols-2 gap-x-4 text-center">
        <span className="text-xs text-n-500">{t.fromDate}</span><span className="text-xs text-n-500">{t.toDate}</span>
        <strong className="text-md tabular-nums">{fmtDate(days[0])}</strong><strong className="text-md tabular-nums">{fmtDate(days[6])}</strong>
      </div>
      <IconButton label="Next week" disabled={days[6] >= todayIso()} onClick={onNext} className="ring-1 ring-n-300 bg-white text-lg disabled:opacity-40">›</IconButton>
    </div>
  );
}
