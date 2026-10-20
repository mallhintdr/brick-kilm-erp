import { useEffect, useMemo, useRef, useState } from 'react';
import { useT, useLang } from '../i18n.js';
import { get, put, fmtDate } from '../api.js';
import { useTypes, typeLabel } from '../useTypes.js';
import {
  Card, CardHeader, CardBody, Field, Input, Select, FormGrid, Button, IconButton, Alert, Section, StatGrid, StatCard,
  Tabs, Badge, TableCard, tbl, FilterInput, Empty, cx,
} from '../components/ui.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const STATUSES = ['present', 'absent', 'leave', 'half'];
// colour of each mark: chosen = filled, not chosen = outline
const MARK = {
  present: ['bg-gain text-white ring-gain', 'text-gain ring-green-300'],
  absent: ['bg-loss text-white ring-loss', 'text-loss ring-red-300'],
  leave: ['bg-amber-500 text-white ring-amber-500', 'text-caution ring-amber-300'],
  half: ['bg-sky-600 text-white ring-sky-600', 'text-sky-700 ring-sky-300'],
};
const BADGE = { present: 'ok', absent: 'err', leave: 'warn', half: 'brand' };

// Daily attendance: tap P / A / L / ½ for each worker, then save the day.
export default function Attendance() {
  const t = useT();
  const { lang } = useLang();
  const cats = useTypes('workerCategory');
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [catQ, setCatQ] = useState(''); // category filter typed in the list header
  const [workers, setWorkers] = useState([]);
  const [marks, setMarks] = useState({}); // workerId -> status
  const [saved, setSaved] = useState({});
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [busy, setBusy] = useState(false);
  const [recordFor, setRecordFor] = useState(''); // worker whose record is open below the list

  useEffect(() => { get('/workers').then((w) => setWorkers(w.filter((x) => x.status !== 'inactive').sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {}); }, []);
  useEffect(() => {
    setMsg({ text: '', bad: false });
    get(`/attendance?date=${date}`).then((rows) => {
      const m = Object.fromEntries(rows.map((r) => [r.workerId, r.status]));
      setMarks(m); setSaved(m);
    }).catch(() => { setMarks({}); setSaved({}); });
  }, [date]);

  const shown = useMemo(() => workers.filter((w) => (!category || w.category === category)
    && (!query || `${w.name} ${w.fatherName || ''}`.toLowerCase().includes(query.toLowerCase()))
    && (!catQ || String(cats.label(w.category)).toLowerCase().includes(catQ.toLowerCase()))), [workers, category, query, catQ, cats]);
  const count = (st) => shown.filter((w) => marks[w._id] === st).length;
  const changed = shown.filter((w) => marks[w._id] && marks[w._id] !== saved[w._id]).length;

  // save just this worker's mark (the rest of the day can be finished later)
  async function saveOne(w) {
    try {
      await put('/attendance', { date, entries: [{ workerId: w._id, status: marks[w._id] }] });
      setSaved((x) => ({ ...x, [w._id]: marks[w._id] }));
      setMsg({ text: `${t.savedOk}: ${w.name}`, bad: false });
    } catch (e) { setMsg({ text: e.message, bad: true }); }
  }

  async function save() {
    setBusy(true);
    try {
      const entries = shown.filter((w) => marks[w._id]).map((w) => ({ workerId: w._id, status: marks[w._id] }));
      await put('/attendance', { date, entries });
      setSaved({ ...saved, ...Object.fromEntries(entries.map((e) => [e.workerId, e.status])) });
      setMsg({ text: `${t.savedOk} (${entries.length})`, bad: false });
    } catch (e) { setMsg({ text: e.message, bad: true }); }
    setBusy(false);
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title={t.attendance} />
        <CardBody>
          <FormGrid className="lg:grid-cols-3">
            <Field label={t.date}><Input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label={t.category}>
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">{t.allCategories}</option>
                {cats.active.map((c) => <option key={c.key} value={c.key}>{typeLabel(c, lang)}</option>)}
              </Select>
            </Field>
            <Field label={t.name}><Input type="search" placeholder={t.typeToSearch} value={query} onChange={(e) => setQuery(e.target.value)} /></Field>
          </FormGrid>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={() => setMarks({ ...marks, ...Object.fromEntries(shown.map((w) => [w._id, 'present'])) })}>{t.markAllPresent}</Button>
            <Button disabled={busy || !shown.some((w) => marks[w._id])} onClick={save}>{t.save}{changed ? ` (${changed})` : ''}</Button>
          </div>
          {msg.text && <Alert tone={msg.bad ? 'err' : 'ok'}>{msg.text}</Alert>}
        </CardBody>
      </Card>

      <Card className="p-4">
        <Section title={fmtDate(date)}>
          <StatGrid className="grid-cols-4 sm:grid-cols-4 lg:grid-cols-4">
            <StatCard label={t.att_present} value={count('present')} tone="green" />
            <StatCard label={t.att_absent} value={count('absent')} tone="red" />
            <StatCard label={t.att_leave} value={count('leave')} tone="amber" />
            <StatCard label={t.att_half} value={count('half')} tone="blue" />
          </StatGrid>
        </Section>
      </Card>

      <TableCard title={`${t.workers} (${shown.length})`}>
        <table className={cx(tbl.table, 'text-sm')}>
          <thead>
            <tr>
              <th className={cx('rownum', tbl.th)}>#</th><th className={tbl.th}>{t.name}</th>
              <th className={tbl.th}>{t.category}</th><th className={tbl.th}>{t.attStatus}</th>
            </tr>
            <tr className="filter-row">
              <th className={cx('rownum', tbl.fth)} />
              <th className={tbl.fth}><FilterInput aria-label={t.name} value={query} onChange={(e) => setQuery(e.target.value)} /></th>
              <th className={tbl.fth}><FilterInput aria-label={t.category} value={catQ} onChange={(e) => setCatQ(e.target.value)} /></th>
              <th className={tbl.fth} />
            </tr>
          </thead>
          <tbody>
            {shown.map((w, i) => {
              const m = marks[w._id];
              const isSaved = m && m === saved[w._id];
              return (
                <tr key={w._id} className={tbl.tr}>
                  <td className={cx('rownum', tbl.td, 'px-1 text-n-500')}>{i + 1}</td>
                  <td className={cx(tbl.td, 'px-1.5 text-start')}>
                    <button type="button" onClick={() => setRecordFor(w._id)} title={t.attRecord}
                      className={cx('min-h-0 border-0 bg-transparent p-0 text-start text-sm underline-offset-2 hover:underline', recordFor === w._id ? 'text-brand-700' : 'text-n-900')}>
                      <strong>{w.name}</strong>{w.fatherName ? <span className="text-n-500"> — {w.fatherName}</span> : null}
                    </button>
                  </td>
                  <td className={cx(tbl.td, 'px-1.5 text-xs')}>{cats.label(w.category)}</td>
                  <td className={cx(tbl.td, 'px-1')}>
                    <div className="inline-flex items-center gap-1" role="radiogroup" aria-label={w.name}>
                      {STATUSES.map((st) => (
                        <button key={st} type="button" role="radio" aria-checked={m === st} title={t[`att_${st}`]} onClick={() => setMarks({ ...marks, [w._id]: st })}
                          className={cx('grid size-8 min-h-0 place-items-center rounded-md border-0 p-0 text-xs font-bold ring-1', m === st ? MARK[st][0] : cx('bg-white', MARK[st][1]))}>
                          {t[`attShort_${st}`]}
                        </button>
                      ))}
                      <button type="button" disabled={!m || isSaved} onClick={() => saveOne(w)}
                        title={isSaved ? t.savedOk : t.save} aria-label={`${t.save} ${w.name}`}
                        className={cx('grid size-8 min-h-0 place-items-center rounded-md border-0 p-0 text-sm font-bold ring-1', isSaved ? 'bg-green-50 text-gain ring-green-300' : 'bg-brand-600 text-white ring-brand-600 disabled:bg-n-100 disabled:text-n-400 disabled:ring-n-200')}>
                        ✓
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!shown.length && <Empty cols={4}>{t.noEntries}</Empty>}
          </tbody>
        </table>
      </TableCard>
      {recordFor && <WorkerRecord t={t} worker={workers.find((w) => w._id === recordFor)} onClose={() => setRecordFor('')} />}
    </div>
  );
}

// One worker's attendance over the last 7 / 15 / 30 days, day by day, with totals.
// Days with no mark show as "not marked" so gaps are visible.
function WorkerRecord({ t, worker, onClose }) {
  const workerId = worker?._id || '';
  const boxRef = useRef(null);
  useEffect(() => { boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [workerId]);
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!workerId) { setRows([]); return; }
    const to = today();
    const from = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
    get(`/attendance/worker/${workerId}?from=${from}&to=${to}`).then(setRows).catch(() => setRows([]));
  }, [workerId, days]);
  const byDate = Object.fromEntries(rows.map((r) => [r.date, r.status]));
  const list = Array.from({ length: days }, (_, i) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  const n = (st) => list.filter((d) => byDate[d] === st).length;
  return (
    <div ref={boxRef}>
      <Card>
        <CardHeader title={`${t.attRecord}: ${worker?.name || ''}${worker?.fatherName ? ` — ${worker.fatherName}` : ''}`}>
          <IconButton label={t.close || 'Close'} onClick={onClose}>✕</IconButton>
        </CardHeader>
        <CardBody>
          <Tabs options={[[7, t.attWeek], [15, t.att15], [30, t.attMonth]]} value={days} onChange={setDays} />
          {workerId && (
            <>
              <StatGrid className="grid-cols-4 sm:grid-cols-4 lg:grid-cols-4">
                <StatCard label={t.att_present} value={n('present') + n('half') / 2} tone="green" />
                <StatCard label={t.att_absent} value={n('absent')} tone="red" />
                <StatCard label={t.att_leave} value={n('leave')} tone="amber" />
                <StatCard label={t.attNotMarked} value={list.filter((d) => !byDate[d]).length} tone="slate" />
              </StatGrid>
              <div className="table-wrap overflow-x-auto rounded-lg ring-1 ring-n-200">
                <table className={tbl.table}>
                  <thead><tr><th className={cx('sticky-col', tbl.th)}>{t.date}</th><th className={tbl.th}>{t.attStatus}</th></tr></thead>
                  <tbody>
                    {list.map((d) => (
                      <tr key={d} className={tbl.tr}>
                        <td className={tbl.td}><strong>{fmtDate(d)}</strong> <span className="text-n-500">{new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</span></td>
                        <td className={tbl.td}>{byDate[d] ? <Badge tone={BADGE[byDate[d]]}>{t[`att_${byDate[d]}`]}</Badge> : <span className="text-n-400">{t.attNotMarked}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
