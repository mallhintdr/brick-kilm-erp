import { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n.js';
import { get, post, put, del, uuid, fmtDate, getRole } from '../api.js';
import SearchSelect from '../components/SearchSelect.jsx';
import RowActions, { useRowEdit, IconBtn } from '../components/RowActions.jsx';

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
  const [f, setF] = useState({ teamId: '', count: '', kharaba: '0', date: todayIso() });
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
        ...(f.teamId.startsWith('w:') ? { workerId: f.teamId.slice(2) } : { teamId: f.teamId.slice(2) }), count: Number(f.count), kharaba: Number(f.kharaba || 0), date: f.date, clientUuid: uuid(),
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
  const totalKharaba = list.reduce((a, b) => a + (Number(b.kharaba) || 0), 0);
  const totalNet = list.reduce((a, b) => a + (Number(b.netCount) || 0), 0);
  const currentNet = Math.max(0, (Number(f.count) || 0) - (Number(f.kharaba) || 0));

  const shown = list.filter((b) => {
    if (filters.date && !fmtDate(b.date).includes(filters.date)) return false;
    if (filters.team && !teamName(b.teamId).toLowerCase().includes(filters.team.toLowerCase())) return false;
    if (filters.count && !String(b.count).includes(filters.count)) return false;
    return true;
  });

  return (
    <div className="grid">
      <div className="kpi-grid">
        <div className="stat"><span>Total Moulded</span><strong>{totalMoulded.toLocaleString()}</strong></div>
        <div className="stat"><span>Net Accepted</span><strong className="ok">{totalNet.toLocaleString()}</strong></div>
        <div className="stat"><span>{t.kharaba}</span><strong className={totalKharaba > 0 ? 'warn' : ''}>{totalKharaba.toLocaleString()}</strong></div>
      </div>

      {/* Weekly entry: every pathera team × 7 days, saved in one go */}
      <details className="card week-card">
        <summary className="week-summary"><h2>{t.weeklyEntry}</h2></summary>
        <div className="grid week-body">
        <div className="week-controls">
          <div className="row" style={{ alignItems: 'center', gap: '0.35rem' }}>
            <button type="button" className="ghost" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">‹</button>
            <div className="week-range">
              <span>{t.fromDate}</span><span>{t.toDate}</span>
              <strong>{fmtDate(weekDays[0])}</strong><strong>{fmtDate(weekDays[6])}</strong>
            </div>
            <button type="button" className="ghost" disabled={weekDays[6] >= todayIso()} onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">›</button>
          </div>
          <div className="row week-tools" style={{ alignItems: 'center', gap: '0.35rem' }}>
            <select className="week-select" aria-label={t.weeklyEntry} value={weekStart} onChange={(e) => setWeekStart(e.target.value)}>
              {!weekOptions.includes(weekStart) && <option value={weekStart}>{fmtDate(weekStart)} — {fmtDate(addDays(weekStart, 6))}</option>}
              {weekOptions.map((w) => <option key={w} value={w}>{fmtDate(w)} — {fmtDate(addDays(w, 6))}</option>)}
            </select>
            {isOwner && weekBatches.length > 0 && (
              <div className="row-actions">
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
        </div>
        <div className="table-wrap">
          <table className="week-grid">
            <thead>
              <tr>
                <th className="sticky-col">{t.team}</th>
                {weekDays.map((d) => <th key={d}>{fmtDate(d).slice(0, 5)}</th>)}
                <th>{t.total || 'Total'}</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((tm) => (
                <tr key={tm._id}>
                  <td><strong>{tm.label}</strong></td>
                  {weekDays.map((d) => {
                    const bs = saved[`${tm._id}|${d}`];
                    if (bs) {
                      // Saved cell: plain value; editable in edit mode when it holds a single batch
                      if (weekEdit && bs.length === 1) {
                        return (
                          <td key={d} className="week-cell-edit">
                            <input
                              inputMode="numeric" aria-label={`${tm.label} ${d}`}
                              value={editVals[bs[0]._id] ?? ''}
                              onChange={(e) => setEditVals((v) => ({ ...v, [bs[0]._id]: e.target.value.replace(/[^\d]/g, '') }))}
                            />
                          </td>
                        );
                      }
                      return (
                        <td key={d} className="week-cell-saved" title={bs.length > 1 ? t.multipleEntries : undefined}>
                          {savedCount(tm._id, d).toLocaleString()}{bs.length > 1 && <sup>×{bs.length}</sup>}
                        </td>
                      );
                    }
                    return (
                      <td key={d}>
                        <input
                          inputMode="numeric" aria-label={`${tm.label} ${d}`} disabled={d > todayIso() || weekEdit}
                          value={grid[tm._id]?.[d] ?? ''} onChange={(e) => setCell(tm._id, d, e.target.value)}
                        />
                      </td>
                    );
                  })}
                  <td><strong>{rowTotal(tm._id).toLocaleString()}</strong></td>
                </tr>
              ))}
              {!teams.length && <tr><td colSpan={9} className="muted">{t.noEntries}</td></tr>}
            </tbody>
            <tfoot>
              <tr>
                <td>{t.total || 'Total'}</td>
                {weekDays.map((d) => <td key={d}>{dayTotal(d).toLocaleString()}</td>)}
                <td>{weekTotal.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <button type="button" className="primary fit-center" disabled={weekBusy || weekEdit || !newTotal} onClick={saveWeek}>
          {weekBusy ? '...' : `💾 ${t.saveWeek}`}
        </button>
        </div>
      </details>

      {/* Single batch entry (with kharaba), any past date */}
      <form className="card grid" onSubmit={submit}>
        <h2>{t.moulding} — {t.singleEntry}</h2>
        <div className="grid two" style={{ gap: '0.9rem' }}>
          <label>
            {t.moulderOrTeam}
            <SearchSelect
              required ariaLabel={t.moulderOrTeam} placeholder={t.typeToSearch} value={f.teamId}
              onChange={(v) => setF({ ...f, teamId: v })}
              options={[
                // every registered moulder (w:<id>), then teams of several moulders (t:<id>)
                ...moulders.map((w) => ({ value: `w:${w._id}`, label: w.fatherName ? `${w.name} — ${w.fatherName}` : w.name, search: `${w.cnic || ''} ${w.phone || ''}` })),
                ...teams.filter((tm) => !tm.solo).map((tm) => ({ value: `t:${tm._id}`, label: `${t.team}: ${tm.label}`, search: '' })),
              ]}
            />
          </label>
          <label>
            {t.date || 'Date'}
            <input type="date" required max={todayIso()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </label>
          <label>
            {t.count}
            <input required inputMode="numeric" placeholder="e.g. 10000" value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} />
          </label>
          <label>
            {t.kharaba}
            <input inputMode="numeric" placeholder="0" value={f.kharaba} onChange={(e) => setF({ ...f, kharaba: e.target.value })} />
          </label>
        </div>
        {f.count && <p className="muted" style={{ margin: 0 }}>{t.netCount}: <strong>{currentNet.toLocaleString()}</strong></p>}
        <button className="primary fit-center" disabled={submitting}><span className="plus-icon" aria-hidden="true">+</span> {t.add}</button>
        {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>{msg.text}</p>}
      </form>

      <div className="card table-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem' }}>
          <h2 style={{ margin: 0, border: 'none', padding: 0 }}>{t.moulding} ({shown.length} / {list.length})</h2>
          {Object.values(filters).some(Boolean) && (
            <button type="button" className="clear-filter-btn" onClick={() => setFilters({})}>✕</button>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th className="rownum">#</th>
              <th className="sticky-col">{t.date || 'Date'}</th>
              <th>{t.team}</th>
              <th>{t.count}</th>
              <th>{t.kharaba}</th>
              <th>{t.netCount}</th>
              <th className="actions">{t.action}</th>
            </tr>
            <tr className="filter-row">
              <th className="rownum" />
              <th><input type="search" className="table-col-filter" value={filters.date || ''} onChange={(e) => setFilters({ ...filters, date: e.target.value })} /></th>
              <th><input type="search" className="table-col-filter" value={filters.team || ''} onChange={(e) => setFilters({ ...filters, team: e.target.value })} /></th>
              <th><input type="search" className="table-col-filter" value={filters.count || ''} onChange={(e) => setFilters({ ...filters, count: e.target.value })} /></th>
              <th /><th /><th className="actions" />
            </tr>
          </thead>
          <tbody>
            {shown.map((b, i) => {
              const editing = editor.isEditing(b._id);
              return (
                <tr key={b._id}>
                  <td className="rownum">{i + 1}</td>
                  <td>{editing ? <input type="date" className="cell-input" max={todayIso()} {...editor.field('date')} /> : <strong>{fmtDate(b.date)}</strong>}</td>
                  <td>{teamName(b.teamId)}</td>
                  <td>{editing ? <input inputMode="numeric" className="cell-input" {...editor.field('count')} /> : <strong>{Number(b.count).toLocaleString()}</strong>}</td>
                  <td>{editing ? <input inputMode="numeric" className="cell-input" {...editor.field('kharaba')} /> : Number(b.kharaba).toLocaleString()}</td>
                  <td><strong className="ok">{Number(b.netCount).toLocaleString()}</strong></td>
                  <td className="actions">
                    <RowActions
                      editor={editor} id={b._id} path={`/moulding/${b._id}`} name={`${b.netCount} — ${fmtDate(b.date)}`}
                      initial={{ date: iso(new Date(b.date)), count: String(b.count), kharaba: String(b.kharaba) }}
                      toPayload={(d) => ({ date: d.date, count: Number(d.count), kharaba: Number(d.kharaba || 0) })}
                      onSaved={() => { setMsg({ text: t.savedOk, bad: false }); load(); }}
                      onDeleted={(r) => { setMsg({ text: r?.legacyNoLedgerLink ? `${t.deleted} — ${t.legacyNote}` : t.deleted, bad: false }); load(); }}
                      onError={(m) => setMsg({ text: m, bad: true })}
                    />
                  </td>
                </tr>
              );
            })}
            {!shown.length && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: '1.5rem' }}>{t.noEntries}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
