import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import LineDiagram from '../components/LineDiagram.jsx';
import { useT } from '../i18n.js';
import { get, post, uuid, fmtDateTime } from '../api.js';
import DateTime from '../components/DateTime.jsx';
import RowActions, { useRowEdit } from '../components/RowActions.jsx';
import KilnLegend from '../components/KilnLegend.jsx';
import { Card, CardHeader, CardBody, Field, Input, Select, FormGrid, Button, Alert, StatGrid, StatCard, Tabs, Badge, TableCard, tbl, FilterInput, ClearFilters, Empty, cx } from '../components/ui.jsx';
import { Save } from 'lucide-react';

export default function Firing() {
  const t = useT();
  const editor = useRowEdit();
  const [firemen, setFiremen] = useState([]);
  const [allLines, setAllLines] = useState([]);
  const [params] = useSearchParams();
  const askedLine = Number(params.get('line')) || null; // from the kiln board's Firing button
  const [list, setList] = useState([]);
  const [f, setF] = useState({ workerIds: [], shift: 'day', coalKg: '', tempC: '', fanOn: true, genHours: '0', lineIndex: askedLine ? String(askedLine) : '', time: new Date(Date.now() + 5 * 3600e3).toISOString().slice(11, 16), date: new Date().toISOString().slice(0, 10) });
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState({});

  const load = () => {
    get('/workers').then((w) => setFiremen(w.filter((x) => x.category === 'jalai' && x.status !== 'inactive').sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {});
    get('/firing-logs').then(setList).catch(() => {});
    get('/kiln-lines').then(setAllLines).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  // lines now firing or preheating, plus the one asked for / chosen on the plan
  // the next 10 loaded lines after the fire (in firing order) can be fired next
  const N = allLines.length;
  const fireAt = allLines.find((l) => l.state === 'Firing')?.index;
  const ahead = new Set();
  if (fireAt && N) {
    for (let k = 1; k <= N && ahead.size < 15; k++) { // wraps: after 240 comes line 1
      const l = allLines.find((x) => x.index === ((fireAt - 1 + k) % N) + 1);
      if (l && ['Loading', 'Preheating'].includes(l.state)) ahead.add(l.index);
    }
  }
  const lines = allLines.filter((l) => l.state === 'Firing' || l.state === 'Preheating' || ahead.has(l.index)
    || (!fireAt && l.state === 'Loading') || l.index === Number(f.lineIndex) || l.index === askedLine);
  const pickLine = (l) => {
    if (!l.currentLoad || l.nikasiTeamId) return;
    setF((cur) => ({ ...cur, lineIndex: String(l.index) }));
    document.querySelector('.firing-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  async function submit(e) {
    e.preventDefault();
    if (!f.workerIds.length) { setMsg({ text: t.chooseFireman, bad: true }); return; }
    setSubmitting(true);
    try {
      const r = await post('/firing-logs', {
        ...f,
        coalKg: Number(f.coalKg),
        tempC: Number(f.tempC),
        genHours: Number(f.genHours),
        lineIndex: f.lineIndex ? Number(f.lineIndex) : undefined,
        time: f.time || undefined,
        clientUuid: uuid(),
      });
      const fanWarn = r.fanAlert ? ` — ⚠️ ${t.fanAlertMsg}` : '';
      setMsg({ text: (r.queued ? t.queued : t.savedOk) + fanWarn, bad: !!r.fanAlert });
      setF({ ...f, coalKg: '', tempC: '' });
      load();
    } catch (e2) {
      setMsg({ text: e2.message, bad: true });
    } finally {
      setSubmitting(false);
    }
  }

  const latestTemp = list[0]?.tempC;
  const totalCoalToday = list.reduce((a, l) => a + (Number(l.coalKg) || 0), 0);

  const has = (v, q) => !q || String(v ?? '').toLowerCase().includes(q.toLowerCase());
  const shown = list.filter((f2) => has(fmtDateTime(f2.date), filters.date) && has(f2.shift === 'day' ? t.day : t.night, filters.shift)
    && has(f2.lineIndex, filters.line) && has(f2.coalKg, filters.coalKg) && has(f2.tempC, filters.tempC));
  const stateText = (l) => (l.state === 'Firing' ? `🔥 ${t.stFiring}` : l.state === 'Preheating' ? t.stPreheating : t[{ Loading: 'loading', Cooling: 'cooling', Ready: 'readyToUnload' }[l.state]] || l.state);

  return (
    <div className="grid gap-4">
      <StatGrid className="grid-cols-2 sm:grid-cols-2 lg:grid-cols-2">
        <StatCard label={t.tempC} value={latestTemp ? `${latestTemp} °C` : '—'} tone="orange" />
        <StatCard label={t.coalKg} value={`${totalCoalToday.toLocaleString()} kg`} tone="blue" />
      </StatGrid>

      <Card data-tour="firing-form" className="firing-form">
        <CardHeader title={t.firing} />
        <form onSubmit={submit}>
          <CardBody>
            <FormGrid className="lg:grid-cols-3">
              <Field label={t.fireman}>
                <Select required value={f.workerIds[0] || ''} onChange={(e) => setF({ ...f, workerIds: [e.target.value] })}>
                  <option value="" disabled>— {firemen.length ? t.chooseFireman : t.noFiremen} —</option>
                  {firemen.map((w) => <option key={w._id} value={w._id}>{w.name}{w.fatherName ? ` — ${w.fatherName}` : ''}</option>)}
                </Select>
              </Field>
              <Field label={t.shift}>
                <Tabs options={[['day', `☀️ ${t.day}`], ['night', `🌙 ${t.night}`]]} value={f.shift} onChange={(v) => setF({ ...f, shift: v })} className="min-h-11 items-stretch" />
              </Field>
              <Field label={t.lineNo} hint={t.chooseOnPlan}>
                <Select value={f.lineIndex} onChange={(e) => setF({ ...f, lineIndex: e.target.value })}>
                  <option value="">—</option>
                  {lines.map((l) => <option key={l.index} value={l.index}>{l.index} — {stateText(l)}</option>)}
                </Select>
              </Field>
              <Field label={t.entryDate}><Input type="date" required max={new Date().toISOString().slice(0, 10)} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
              <Field label={t.time}><Input type="time" required value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
              <Field label={t.coalKg}><Input required inputMode="numeric" placeholder="1200" value={f.coalKg} onChange={(e) => setF({ ...f, coalKg: e.target.value })} /></Field>
              <Field label={t.tempC}><Input required inputMode="numeric" placeholder="950" value={f.tempC} onChange={(e) => setF({ ...f, tempC: e.target.value })} /></Field>
            </FormGrid>
            <Button type="submit" loading={submitting} className="justify-self-center sm:min-w-48"><Save className="size-4 shrink-0" aria-hidden="true" /> {t.logFiring}</Button>
            {msg.text && <Alert tone={msg.bad ? 'err' : 'ok'}>{msg.text}</Alert>}
          </CardBody>
        </form>
      </Card>

      {/* firing board: tap a line to pick it for the log */}
      {allLines.length > 0 && (
        <Card>
          <CardHeader title={`${t.kilnBoard} — ${t.firing}`} />
          <CardBody>
            <KilnLegend rows={allLines} t={t} />
            <LineDiagram lines={allLines} selected={allLines.find((l) => l.index === Number(f.lineIndex))} onSelect={pickLine} t={t}
              fireIndex={allLines.find((l) => l.state === 'Firing')?.index} mode="fire" />
          </CardBody>
        </Card>
      )}

      <TableCard
        title={`${t.firing} (${shown.length} / ${list.length})`}
        actions={<ClearFilters show={Object.values(filters).some(Boolean)} onClick={() => setFilters({})} label={t.clearAll} />}
      >
        <table className={tbl.table}>
          <thead>
            <tr>
              <th className={cx('rownum', tbl.th)}>#</th>
              {[t.dateTime, t.shift, t.lineNo, t.coalKg, t.tempC].map((h) => <th key={h} className={tbl.th}>{h}</th>)}
              <th className={cx('actions', tbl.th)}>{t.action}</th>
            </tr>
            <tr className="filter-row">
              <th className={cx('rownum', tbl.fth)} />
              {['date', 'shift', 'line', 'coalKg', 'tempC'].map((k) => (
                <th key={k} className={tbl.fth}><FilterInput aria-label={k} value={filters[k] || ''} onChange={(e) => setFilters({ ...filters, [k]: e.target.value })} /></th>
              ))}
              <th className={cx('actions', tbl.fth)} />
            </tr>
          </thead>
          <tbody>
            {shown.map((f2, i) => {
              const editing = editor.isEditing(f2._id);
              return (
                <tr key={f2._id} className={cx(tbl.tr, editing && 'bg-amber-50!')}>
                  <td className={cx('rownum', tbl.td, 'text-n-500')}>{i + 1}</td>
                  <td className={tbl.td}><DateTime value={f2.date} /></td>
                  <td className={tbl.td}>
                    {editing ? (
                      <select className={tbl.cell} {...editor.field('shift')}>
                        <option value="day">{t.day}</option>
                        <option value="night">{t.night}</option>
                      </select>
                    ) : <Badge>{f2.shift === 'day' ? `☀️ ${t.day}` : `🌙 ${t.night}`}</Badge>}
                  </td>
                  <td className={cx(tbl.td, 'font-semibold')}>{f2.lineIndex || '—'}</td>
                  <td className={cx(tbl.td, 'font-bold')}>{editing ? <input inputMode="numeric" className={tbl.cell} {...editor.field('coalKg')} /> : `${Number(f2.coalKg).toLocaleString()} kg`}</td>
                  <td className={cx(tbl.td, 'font-bold')}>{editing ? <input inputMode="numeric" className={tbl.cell} {...editor.field('tempC')} /> : `${f2.tempC} °C`}</td>
                  <td className={cx('actions', tbl.td)}>
                    <RowActions
                      editor={editor} id={f2._id} path={`/firing-logs/${f2._id}`} name={fmtDateTime(f2.date)}
                      initial={{ shift: f2.shift, coalKg: String(f2.coalKg), tempC: String(f2.tempC) }}
                      toPayload={(d) => ({ shift: d.shift, coalKg: Number(d.coalKg), tempC: Number(d.tempC) })}
                      onSaved={() => { setMsg({ text: t.savedOk, bad: false }); load(); }}
                      onDeleted={(r) => { setMsg({ text: r?.legacyNoLedgerLink ? `${t.deleted} — ${t.legacyNote}` : t.deleted, bad: false }); load(); }}
                      onError={(m) => setMsg({ text: m, bad: true })}
                    />
                  </td>
                </tr>
              );
            })}
            {!shown.length && <Empty cols={7}>{t.noEntries}</Empty>}
          </tbody>
        </table>
      </TableCard>
    </div>
  );
}
