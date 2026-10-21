import { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n.js';
import { get, post, put, del, uuid, fmtDate, getRole } from '../api.js';
import SearchSelect from '../components/SearchSelect.jsx';
import RowActions, { useRowEdit, IconBtn } from '../components/RowActions.jsx';
import { WeekNav } from '../components/WorkWeekGrid.jsx';
import { Card, CardHeader, CardBody, Field, Input, Select, FormGrid, Button, Alert, StatGrid, StatCard, TableCard, tbl, FilterInput, ClearFilters, Empty, cx } from '../components/ui.jsx';
import { Plus, Save } from 'lucide-react';

const iso = (d) => d.toISOString().slice(0, 10);
const todayIso = () => iso(new Date());
// Pakistani kiln weeks run Saturday → Friday (pay day is the next Thursday/Saturday).
const weekStartOf = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const back = (d.getUTCDay() + 1) % 7; // days since Saturday
  d.setUTCDate(d.getUTCDate() - back);
  return iso(d);
};
const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

export default function Moulding() {
  const t = useT();
  const [teams, setTeams] = useState([]);
  const [moulders, setMoulders] = useState([]);
  const [list, setList] = useState([]);
  const [f, setF] = useState({ teamId: '', count: '', kharaba: '0', deductionPct: '2', quality: 'good', date: todayIso() });
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState({});
  const editor = useRowEdit();

  // Weekly grid: { [teamId]: { [date]: count } }
  const [weekStart, setWeekStart] = useState(weekStartOf(todayIso()));
  const [grid, setGrid] = useState({});
  const [weekBusy, setWeekBusy] = useState(false);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // Already-saved batches of the selected week, and the owner's edit drafts { batchId: count }
  const [weekBatches, setWeekBatches] = useState([]);
  const [weekEdit, setWeekEdit] = useState(false);
  const [editVals, setEditVals] = useState({});
  const isOwner = getRole() === 'owner';
  // Last 52 kiln weeks for the dropdown, newest first
  const weekOptions = useMemo(() => {
    const cur = weekStartOf(todayIso());
    return Array.from({ length: 52 }, (_, i) => addDays(cur, -7 * i));
  }, []);

  const loadWeek = (start = weekStart) => {
    get(`/moulding?from=${start}&to=${addDays(start, 6)}`).then(setWeekBatches).catch(() => setWeekBatches([]));
  };
  const load = () => {
    get('/teams').then((all) => setTeams(all.filter((tm) => tm.category === 'pathera'))).catch(() => {});
    get('/workers').then((all) => setMoulders(all.filter((w) => w.category === 'pathera' && w.status !== 'inactive')
      .sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {});
    get('/moulding').then(setList).catch(() => {});
    loadWeek();
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { setWeekEdit(false); setEditVals({}); loadWeek(weekStart); }, [weekStart]);

  // { 'teamId|YYYY-MM-DD': [batch, ...] }
  const saved = useMemo(() => {
    const m = {};
    for (const b of weekBatches) {
      const k = `${b.teamId}|${new Date(b.date).toISOString().slice(0, 10)}`;
      (m[k] ||= []).push(b);
    }
    return m;
  }, [weekBatches]);
  const savedCount = (teamId, d) => (saved[`${teamId}|${d}`] || []).reduce((a, b) => a + (Number(b.count) || 0), 0);
  const cellValue = (teamId, d) => {
    const bs = saved[`${teamId}|${d}`];
    if (bs?.length === 1 && weekEdit && editVals[bs[0]._id] !== undefined) return Number(editVals[bs[0]._id]) || 0;
    return bs ? savedCount(teamId, d) : Number(grid[teamId]?.[d]) || 0;
  };

  function startWeekEdit() {
    const v = {};
    for (const bs of Object.values(saved)) if (bs.length === 1) v[bs[0]._id] = String(bs[0].count);
    setEditVals(v);
    setWeekEdit(true);
  }

  const teamName = (id) => teams.find((tm) => tm._id === id)?.label || '—';

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const r = await post('/moulding', {
        ...(f.teamId.startsWith('w:') ? { workerId: f.teamId.slice(2) } : { teamId: f.teamId.slice(2) }), count: Number(f.count), kharaba: Number(f.kharaba || 0), deductionPct: Number(f.deductionPct || 0), quality: f.quality, date: f.date, clientUuid: uuid(),
      });
      setMsg({ text: r.queued ? t.queued : t.savedOk, bad: false });
      setF({ ...f, count: '', kharaba: '0' });
      load();
    } catch (e2) {
      setMsg({ text: e2.message, bad: true });
    } finally {
      setSubmitting(false);
    }
  }

  async function saveWeek() {
    const cells = [];
    for (const [teamId, days] of Object.entries(grid)) {
      for (const [date, val] of Object.entries(days)) {
        const count = Number(val);
        if (count > 0) cells.push({ teamId, date, count });
      }
    }
    if (!cells.length) return;
    setWeekBusy(true);
    let saved = 0;
    const failed = [];
    for (const c of cells) {
      try {
        await post('/moulding', { ...c, kharaba: 0, clientUuid: uuid() });
        saved++;
        setGrid((g) => ({ ...g, [c.teamId]: { ...g[c.teamId], [c.date]: '' } }));
      } catch (e) {
        failed.push(`${teamName(c.teamId)} ${fmtDate(c.date)}: ${e.message}`);
      }
    }
    setWeekBusy(false);
    setMsg(failed.length
      ? { text: `${saved} ${t.savedOk}; ${failed.join(' | ')}`, bad: true }
      : { text: `${saved} ${t.savedOk}`, bad: false });
    load();
  }

  async function saveWeekEdits() {
    const changes = weekBatches.filter((b) => editVals[b._id] !== undefined && String(b.count) !== editVals[b._id]);
    const removals = changes.filter((b) => !Number(editVals[b._id]));
    if (removals.length && !window.confirm(`${t.confirmDelete}: ${removals.length}?`)) return;
    setWeekBusy(true);
    let done = 0;
    const failed = [];
    for (const b of changes) {
      const v = Number(editVals[b._id]);
      try {
        if (v > 0) await put(`/moulding/${b._id}`, { count: v });
        else await del(`/moulding/${b._id}`);
        done++;
      } catch (e) {
        failed.push(`${teamName(b.teamId)} ${fmtDate(b.date)}: ${e.message}`);
      }
    }
    setWeekBusy(false);
    setWeekEdit(false);
    setEditVals({});
    setMsg(failed.length ? { text: `${done} ${t.savedOk}; ${failed.join(' | ')}`, bad: true } : { text: `${done} ${t.savedOk}`, bad: false });
    load();
  }

  const setCell = (teamId, date, v) => setGrid((g) => ({ ...g, [teamId]: { ...(g[teamId] || {}), [date]: v.replace(/[^\d]/g, '') } }));
  const rowTotal = (teamId) => weekDays.reduce((a, d) => a + cellValue(teamId, d), 0);
  const dayTotal = (d) => teams.reduce((a, tm) => a + cellValue(tm._id, d), 0);
  const weekTotal = teams.reduce((a, tm) => a + rowTotal(tm._id), 0);
  const newTotal = teams.reduce((a, tm) => a + weekDays.reduce((x, d) => x + (saved[`${tm._id}|${d}`] ? 0 : Number(grid[tm._id]?.[d]) || 0), 0), 0);

  const totalMoulded = list.reduce((a, b) => a + (Number(b.count) || 0), 0);
  const totalNet = list.reduce((a, b) => a + (Number(b.netCount) || 0), 0);
  const currentDeduction = Math.round(((Number(f.count) || 0) * (Number(f.deductionPct) || 0)) / 100);
  const currentNet = Math.max(0, (Number(f.count) || 0) - (Number(f.kharaba) || 0) - currentDeduction);

  const shown = list.filter((b) => {
    if (filters.date && !fmtDate(b.date).includes(filters.date)) return false;
    if (filters.team && !teamName(b.teamId).toLowerCase().includes(filters.team.toLowerCase())) return false;
    if (filters.count && !String(b.count).includes(filters.count)) return false;
    return true;
  });

  const cellInput = 'mx-auto block h-8 min-h-0 w-16 rounded-md border-0 bg-white px-1 text-center text-sm ring-1 ring-n-300 outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-n-100';

  return (
    <div className="grid gap-4">
      <StatGrid className="grid-cols-2 sm:grid-cols-2 lg:grid-cols-2">
        <StatCard label={t.srMoulded} value={totalMoulded.toLocaleString()} tone="orange" />
        <StatCard label={t.netCount} value={totalNet.toLocaleString()} tone="green" />
      </StatGrid>

      {/* Weekly entry: every pathera team × 7 days, saved in one go */}
      <details className="group overflow-hidden rounded-lg bg-white shadow-[0_1px_2px_rgba(28,25,23,.05)] ring-1 ring-n-200">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
          <h2 className="m-0 text-lg font-bold text-n-900">{t.weeklyEntry}</h2>
          <span className="text-n-500 transition group-open:rotate-180" aria-hidden="true">▾</span>
        </summary>
        <div className="grid gap-3 border-t border-n-100 p-4">
          <WeekNav t={t} days={weekDays} onPrev={() => setWeekStart(addDays(weekStart, -7))} onNext={() => setWeekStart(addDays(weekStart, 7))} />
          <div className="flex items-center justify-center gap-2">
            <Select aria-label={t.weeklyEntry} value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="min-h-10 max-w-72">
              {!weekOptions.includes(weekStart) && <option value={weekStart}>{fmtDate(weekStart)} — {fmtDate(addDays(weekStart, 6))}</option>}
              {weekOptions.map((w) => <option key={w} value={w}>{fmtDate(w)} — {fmtDate(addDays(w, 6))}</option>)}
            </Select>
            {isOwner && weekBatches.length > 0 && (
              <div className="inline-flex gap-1.5">
                {weekEdit ? (
                  <>
                    <IconBtn kind="save" title={t.save} onClick={saveWeekEdits} disabled={weekBusy} />
                    <IconBtn kind="cancel" title={t.cancel} onClick={() => { setWeekEdit(false); setEditVals({}); }} disabled={weekBusy} />
                  </>
                ) : (
                  <IconBtn kind="edit" title={t.edit} onClick={startWeekEdit} disabled={weekBusy} />
                )}
              </div>
            )}
          </div>
          <div className="table-wrap overflow-x-auto rounded-lg ring-1 ring-n-200">
            <table className={cx(tbl.table, 'text-sm')}>
              <thead>
                <tr>
                  <th className={cx('sticky-col', tbl.th)}>{t.team}</th>
                  {weekDays.map((d) => <th key={d} className={tbl.th}>{fmtDate(d).slice(0, 5)}</th>)}
                  <th className={tbl.th}>{t.total}</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((tm) => (
                  <tr key={tm._id} className={tbl.tr}>
                    <td className={cx(tbl.td, 'px-2 text-start font-semibold')}>{tm.label}</td>
                    {weekDays.map((d) => {
                      const bs = saved[`${tm._id}|${d}`];
                      if (bs) {
                        // saved cell: plain value; editable in edit mode when it holds a single batch
                        if (weekEdit && bs.length === 1) {
                          return (
                            <td key={d} className={cx(tbl.td, 'bg-amber-50! px-1')}>
                              <input inputMode="numeric" aria-label={`${tm.label} ${d}`} className={cx(cellInput, 'ring-amber-400')}
                                value={editVals[bs[0]._id] ?? ''} onChange={(e) => setEditVals((v) => ({ ...v, [bs[0]._id]: e.target.value.replace(/[^\d]/g, '') }))} />
                            </td>
                          );
                        }
                        return (
                          <td key={d} className={cx(tbl.td, 'bg-green-50! px-1 font-semibold text-gain')} title={bs.length > 1 ? t.multipleEntries : undefined}>
                            {savedCount(tm._id, d).toLocaleString()}{bs.length > 1 && <sup>×{bs.length}</sup>}
                          </td>
                        );
                      }
                      return (
                        <td key={d} className={cx(tbl.td, 'px-1')}>
                          <input inputMode="numeric" aria-label={`${tm.label} ${d}`} disabled={d > todayIso() || weekEdit} className={cellInput}
                            value={grid[tm._id]?.[d] ?? ''} onChange={(e) => setCell(tm._id, d, e.target.value)} />
                        </td>
                      );
                    })}
                    <td className={cx(tbl.td, 'font-bold')}>{rowTotal(tm._id).toLocaleString()}</td>
                  </tr>
                ))}
                {!teams.length && <Empty cols={9}>{t.noEntries}</Empty>}
              </tbody>
              <tfoot>
                <tr className="bg-n-100 font-bold">
                  <td className={tbl.td}>{t.total}</td>
                  {weekDays.map((d) => <td key={d} className={tbl.td}>{dayTotal(d).toLocaleString()}</td>)}
                  <td className={tbl.td}>{weekTotal.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <Button loading={weekBusy} disabled={weekEdit || !newTotal} onClick={saveWeek} className="justify-self-center sm:min-w-48"><Save className="size-4 shrink-0" aria-hidden="true" /> {t.saveWeek}</Button>
        </div>
      </details>

      {/* Single batch entry, any past date */}
      <Card>
        <CardHeader title={`${t.moulding} — ${t.singleEntry}`} />
        <form onSubmit={submit}>
          <CardBody>
            <FormGrid className="lg:grid-cols-3">
              <Field label={t.moulderOrTeam} className="col-span-2 lg:col-span-1">
                <SearchSelect
                  required ariaLabel={t.moulderOrTeam} placeholder={t.typeToSearch} value={f.teamId}
                  onChange={(v) => setF({ ...f, teamId: v })}
                  options={[
                    // every registered moulder (w:<id>), then teams of several moulders (t:<id>)
                    ...moulders.map((w) => ({ value: `w:${w._id}`, label: w.fatherName ? `${w.name} — ${w.fatherName}` : w.name, search: `${w.cnic || ''} ${w.phone || ''}` })),
                    ...teams.filter((tm) => !tm.solo).map((tm) => ({ value: `t:${tm._id}`, label: `${t.team}: ${tm.label}`, search: '' })),
                  ]}
                />
              </Field>
              <Field label={t.date}><Input type="date" required max={todayIso()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
              <Field label={t.count}><Input required inputMode="numeric" placeholder="10000" value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} /></Field>
              <Field label={t.deductionPct}><Input inputMode="decimal" value={f.deductionPct} onChange={(e) => setF({ ...f, deductionPct: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
              <Field label={t.quality}>
                <Select value={f.quality} onChange={(e) => setF({ ...f, quality: e.target.value })}>
                  <option value="good">{t.qGood}</option>
                  <option value="satisfactory">{t.qSatisfactory}</option>
                  <option value="poor">{t.qPoor}</option>
                </Select>
              </Field>
            </FormGrid>
            {f.count && (
              <p className="m-0 rounded-md bg-n-50 px-3 py-2 text-center text-md text-n-600">
                {t.deductionPct}: <strong className="text-n-900">{currentDeduction.toLocaleString()}</strong> · {t.netCount}: <strong className="text-gain">{currentNet.toLocaleString()}</strong>
              </p>
            )}
            <Button type="submit" loading={submitting} className="justify-self-center sm:min-w-40"><Plus className="size-4 shrink-0" aria-hidden="true" /> {t.add}</Button>
            {msg.text && <Alert tone={msg.bad ? 'err' : 'ok'}>{msg.text}</Alert>}
          </CardBody>
        </form>
      </Card>

      <TableCard
        title={`${t.moulding} (${shown.length} / ${list.length})`}
        actions={<ClearFilters show={Object.values(filters).some(Boolean)} onClick={() => setFilters({})} label={t.clearAll} />}
      >
        <table className={tbl.table}>
          <thead>
            <tr>
              <th className={cx('rownum', tbl.th)}>#</th><th className={cx('sticky-col', tbl.th)}>{t.date}</th>
              <th className={tbl.th}>{t.team}</th><th className={tbl.th}>{t.count}</th><th className={tbl.th}>{t.netCount}</th>
              <th className={cx('actions', tbl.th)}>{t.action}</th>
            </tr>
            <tr className="filter-row">
              <th className={cx('rownum', tbl.fth)} />
              {['date', 'team', 'count'].map((k) => (
                <th key={k} className={tbl.fth}><FilterInput aria-label={k} value={filters[k] || ''} onChange={(e) => setFilters({ ...filters, [k]: e.target.value })} /></th>
              ))}
              <th className={tbl.fth} /><th className={cx('actions', tbl.fth)} />
            </tr>
          </thead>
          <tbody>
            {shown.map((b, i) => {
              const editing = editor.isEditing(b._id);
              return (
                <tr key={b._id} className={cx(tbl.tr, editing && 'bg-amber-50!')}>
                  <td className={cx('rownum', tbl.td, 'text-n-500')}>{i + 1}</td>
                  <td className={cx(tbl.td, 'font-semibold')}>{editing ? <input type="date" className={tbl.cell} max={todayIso()} {...editor.field('date')} /> : fmtDate(b.date)}</td>
                  <td className={tbl.td}>{teamName(b.teamId)}</td>
                  <td className={cx(tbl.td, 'font-bold')}>{editing ? <input inputMode="numeric" className={tbl.cell} {...editor.field('count')} /> : Number(b.count).toLocaleString()}</td>
                  <td className={cx(tbl.td, 'font-bold text-gain')}>{Number(b.netCount).toLocaleString()}</td>
                  <td className={cx('actions', tbl.td)}>
                    <RowActions
                      editor={editor} id={b._id} path={`/moulding/${b._id}`} name={`${b.netCount} — ${fmtDate(b.date)}`}
                      initial={{ date: iso(new Date(b.date)), count: String(b.count) }}
                      toPayload={(d) => ({ date: d.date, count: Number(d.count) })}
                      onSaved={() => { setMsg({ text: t.savedOk, bad: false }); load(); }}
                      onDeleted={(r) => { setMsg({ text: r?.legacyNoLedgerLink ? `${t.deleted} — ${t.legacyNote}` : t.deleted, bad: false }); load(); }}
                      onError={(m) => setMsg({ text: m, bad: true })}
                    />
                  </td>
                </tr>
              );
            })}
            {!shown.length && <Empty cols={6}>{t.noEntries}</Empty>}
          </tbody>
        </table>
      </TableCard>
    </div>
  );
}
