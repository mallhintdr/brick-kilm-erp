import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n.js';
import { get, post, put, uuid, getRole, fmtDate, fmtDateTime } from '../api.js';
import KilnDiagram from '../components/KilnDiagram.jsx';
import LineDiagram from '../components/LineDiagram.jsx';
import SearchSelect from '../components/SearchSelect.jsx';
import WorkWeekGrid from '../components/WorkWeekGrid.jsx';

const STATE_LABEL_KEY = {
  Empty: 'empty',
  Loading: 'loading',
  Preheating: 'preheating',
  Firing: 'firingState',
  Cooling: 'cooling',
  Unloading: 'unloading',
};

const STATE_CLASS = {
  Empty: 'sec-empty',
  Loading: 'sec-loading',
  Preheating: 'sec-preheating',
  Firing: 'sec-firing',
  Cooling: 'sec-cooling',
  Unloading: 'sec-unloading',
};

// A kiln is counted either by chambers or by lines (the owner picks); both run the same cycle.
const UNIT_PATH = { chamber: 'kiln-sections', line: 'kiln-lines' };

// focus: 'load' opens the first empty chamber/line (bharai); 'unload' the first one cooled or unloading (nikasi).
export default function KilnBoard({ focus } = {}) {
  const t = useT();
  const isOwner = getRole() === 'owner';
  const [unit, setUnit] = useState(null); // null until the kiln's setting has loaded
  const [rows, setRows] = useState([]);
  const [teams, setTeams] = useState([]);
  const [inventory, setInventory] = useState(null);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({});
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [steps, setSteps] = useState('1');
  const [workers, setWorkers] = useState([]);
  const [notes, setNotes] = useState({ coalKg: '', issues: '' });
  const [history, setHistory] = useState([]);
  const [lf, setLf] = useState({}); // list filters
  const panelRef = useRef(null);
  const planRef = useRef(null);
  const lastIndex = useRef(null);

  // Opening a line brings its form into view; closing or saving returns to the plan at that line.
  useEffect(() => {
    if (sel) {
      lastIndex.current = sel.index;
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } else if (lastIndex.current != null) {
      const idx = lastIndex.current;
      lastIndex.current = null;
      requestAnimationFrame(() => {
        planRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // inside the plan's own scroll box, centre the line that was just worked on
        planRef.current?.querySelector(`[data-index="${idx}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      });
    }
  }, [sel?.index, sel == null]);

  const base = `/${UNIT_PATH[unit || 'chamber']}`;
  const unitLabel = unit === 'line' ? t.line : t.section;

  const loadRows = (u = unit) => (u ? get(`/${UNIT_PATH[u]}`).then((r) => { setRows(r); return r; }) : Promise.resolve([]));
  const load = (u = unit) => {
    get('/teams').then(setTeams).catch(() => {});
    get('/workers').then(setWorkers).catch(() => {});
    get('/inventory/summary').then(setInventory).catch(() => {});
    return loadRows(u).catch(() => []);
  };

  useEffect(() => {
    get('/settings')
      .then((s) => setUnit(s.kilnUnit === 'chamber' ? 'chamber' : 'line'))
      .catch(() => setUnit('line'));
  }, []);
  useEffect(() => {
    if (!unit) return;
    setSel(null); setForm({});
    load(unit).then((r) => {
      const want = focus === 'load' ? ['Empty'] : focus === 'unload' ? ['Unloading', 'Cooling'] : null;
      const first = want && want.map((st) => r.find((x) => x.state === st)).find(Boolean);
      if (first) setSel(first);
    });
  }, [unit]);

  async function switchUnit(next) {
    if (next === unit || !isOwner) return;
    if (!window.confirm(next === 'line' ? t.switchToLinesConfirm : t.switchToChambersConfirm)) return;
    try {
      await put('/settings', { key: 'kilnUnit', value: next });
      setUnit(next);
    } catch (e) {
      setMsg({ text: e.message, bad: true });
    }
  }

  const teamsOf = (cat) => teams.filter((tm) => tm.category === cat);
  const pickOptions = (cat) => [
    ...workers.filter((w) => w.category === cat && w.status !== 'inactive')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((w) => ({ value: `w:${w._id}`, label: w.fatherName ? `${w.name} — ${w.fatherName}` : w.name, search: `${w.cnic || ''} ${w.phone || ''}` })),
    ...teamsOf(cat).filter((tm) => !tm.solo).map((tm) => ({ value: `t:${tm._id}`, label: `${t.team}: ${teamText(tm)}`, search: '' })),
  ];
  const who = (v) => (!v ? {} : v.startsWith('w:') ? { workerId: v.slice(2) } : { teamId: v.slice(2) });
  // team name plus its members' names, so the head (e.g. the jalai mistri) shows in the list
  const teamText = (tm) => {
    const names = (tm.memberIds || []).map((id) => workers.find((w) => w._id === id)?.name).filter(Boolean);
    return names.length ? `${tm.label} — ${names.join(', ')}` : tm.label;
  };

  useEffect(() => {
    if (!sel || !unit) { setHistory([]); return; }
    setNotes({ coalKg: sel.coalKg ? String(sel.coalKg) : '', issues: sel.issues || '' });
    get(`${base}/${sel.index}/history`).then(setHistory).catch(() => setHistory([]));
  }, [sel?.index, unit]);

  const saveNotes = () => act(() => put(`${base}/${sel.index}/notes`, {
    coalKg: notes.coalKg === '' ? 0 : Number(notes.coalKg), issues: notes.issues,
  }), { keep: true });

  // After a line is loaded, step straight to the next line so a whole run can be entered in a row.
  async function act(fn, { next, keep } = {}) {
    setMsg({ text: '', bad: false });
    setSubmitting(true);
    try {
      const r = await fn();
      setMsg({ text: r?.queued ? t.queued : t.savedOk, bad: false });
      const fresh = await load();
      if (keep) { setSel(fresh.find((x) => x.index === sel.index) || null); return; }
      if (next && unit === 'line') {
        const nextRow = fresh.find((x) => x.index === sel.index + 1);
        if (nextRow) { setSel(nextRow); setForm({ teamId: form.teamId, date: form.date }); return; }
      }
      setSel(null);
      setForm({});
    } catch (e) {
      setMsg({ text: e.message || 'Operation failed', bad: true });
    } finally {
      setSubmitting(false);
    }
  }

  const fireAdvance = async () => {
    setAdvancing(true);
    await act(() => post('/fire-advance', { unit, steps: unit === 'line' ? Number(steps) || 1 : 1, clientUuid: uuid() }));
    setAdvancing(false);
  };

  const loadRow = (row) => act(() => post(`${base}/${row.index}/load`, {
    ...who(form.teamId),
    count: Number(form.count),
    date: form.date || new Date().toISOString().slice(0, 10),
    clientUuid: uuid(),
  }), { next: true });

  const startUnload = (row) => act(() => post(`${base}/${row.index}/unload/start`, {
    ...who(form.teamId),
    clientUuid: uuid(),
  }));

  const completeUnload = (row) => act(() => post(`${base}/${row.index}/unload/complete`, {
    awwal: Number(form.awwal || 0),
    doem: Number(form.doem || 0),
    khangar: Number(form.khangar || 0),
    broken: Number(form.broken || 0),
    date: form.date || new Date().toISOString().slice(0, 10),
    clientUuid: uuid(),
  }));

  const pick = (row) => { setSel(row); setForm((f) => ({ teamId: f.teamId })); };
  const stepSel = (d) => {
    const r = rows.find((x) => x.index === sel.index + d);
    if (r) pick(r);
  };

  const firing = rows.filter((s) => s.state === 'Firing');
  const totalInKiln = rows.reduce((acc, s) => acc + (s.currentLoad || 0), 0);

  return (
    <div className="grid">
      {/* Loading / Unloading pages: weekly entry per worker, like moulding */}
      {focus === 'load' && <WorkWeekGrid kind="bharai" />}
      {focus === 'unload' && <WorkWeekGrid kind="nikasi" />}

      {/* Hero Control Card */}
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', background: '#ffffff', border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--brand-tint)', border: '1.5px solid rgba(234, 88, 12, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand)' }}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2c1.5 3-1.5 4.5-1.5 7.5a4 4 0 0 0 7.5 2c0-2-1-3-1-4.5 3.5 2.5 4.5 6 4 9A8 8 0 0 1 4 14c0-4.5 4-6.5 4-10 1.5 0 2 1 2.5 2 0-2 1-3.5 1.5-4z" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t.firingState} {firing.length ? `— ${unitLabel} #${firing.map((f) => f.index).join(', ')}` : '—'}
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--ink)' }}>
              {totalInKiln.toLocaleString()} {t.count} in Kiln
            </div>
          </div>
        </div>

        <div className="kiln-hero-actions">
          {/* how this kiln is counted: owner switches, others see it */}
          <div className="unit-switch" role="group" aria-label={t.countBy}>
            <span className="unit-switch-label">{t.countBy}</span>
            {['chamber', 'line'].map((u) => (
              <button
                key={u} type="button" className={unit === u ? 'on' : ''} aria-pressed={unit === u}
                disabled={!isOwner && unit !== u} onClick={() => switchUnit(u)}
                title={isOwner ? '' : t.ownerOnly}
              >
                {u === 'line' ? t.lines : t.chambers}
              </button>
            ))}
          </div>
          {unit === 'line' && (
            <label className="steps-field">
              {t.linesPerAdvance}
              <input inputMode="numeric" value={steps} onChange={(e) => setSteps(e.target.value.replace(/[^\d]/g, ''))} />
            </label>
          )}
          <button className="primary" disabled={advancing || !unit} onClick={fireAdvance}>
            🔥 {t.advanceFire}
          </button>
        </div>
      </div>

      {msg.text && !sel && (
        <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>
          {msg.text}
        </p>
      )}

      {/* Main Diagram Card */}
      <div className="card" ref={planRef}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2>{t.kilnBoard} — {unit === 'line' ? t.lines : t.chambers}</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 600 }}>
            {unit === 'line' ? t.kilnLinesHint : t.kilnHint}
          </span>
        </div>

        {unit === 'line'
          ? <LineDiagram lines={rows} selected={sel} onSelect={pick} t={t} />
          : unit && <KilnDiagram sections={rows} selected={sel} onSelect={pick} t={t} />}

        <div className="legend">
          {Object.entries(STATE_LABEL_KEY).map(([state, key]) => (
            <span key={state} className={`legend-item ${STATE_CLASS[state]}`}>
              <span>{t[key]}</span>
              <b>{rows.filter((s) => s.state === state).length}</b>
            </span>
          ))}
        </div>
      </div>

      {/* Every chamber / line as a list */}
      {(() => {
        const teamName = (id) => teams.find((tm) => tm._id === id)?.label || '';
        const stateText = (st) => t[STATE_LABEL_KEY[st]] || st;
        const cols = [
          ['index', (r) => r.index], ['side', (r) => r.side || ''], ['state', (r) => stateText(r.state)],
          ['count', (r) => r.currentLoad || 0], ['team', (r) => teamName(r.loadTeamId)],
          ['loaded', (r) => (r.loadedAt ? fmtDate(r.loadedAt) : '')], ['fired', (r) => (r.firedAt ? fmtDateTime(r.firedAt) : '')],
          ['coal', (r) => r.coalKg || ''], ['issues', (r) => r.issues || ''],
        ];
        const shown = rows.filter((r) => cols.every(([k, get]) => !lf[k] || String(get(r)).toLowerCase().includes(lf[k].toLowerCase())));
        const any = Object.values(lf).some(Boolean);
        return (
          <div className="card table-wrap">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem' }}>
              <h2 style={{ margin: 0, border: 'none', padding: 0 }}>{unit === 'line' ? t.lines : t.chambers} ({shown.length} / {rows.length})</h2>
              {any && <button type="button" className="clear-filter-btn" onClick={() => setLf({})}>✕ {t.clearAll}</button>}
            </div>
            <table>
              <thead>
                <tr>
                  <th className="sticky-col">{unitLabel}</th>
                  {unit === 'line' && <th>{t.side}</th>}
                  <th>{t.status}</th>
                  <th>{t.kachiBharai}</th>
                  <th>{t.team}</th>
                  <th>{t.loadedOn}</th>
                  <th>{t.firedOn}</th>
                  <th>{t.coalUsed}</th>
                  <th>{t.issuesAndCauses}</th>
                </tr>
                <tr className="filter-row">
                  {cols.filter(([k]) => unit === 'line' || k !== 'side').map(([k]) => (
                    <th key={k} className={k === 'index' ? 'sticky-col' : undefined}>
                      <input type="search" className="table-col-filter" aria-label={k} value={lf[k] || ''} onChange={(e) => setLf({ ...lf, [k]: e.target.value })} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.index} className={`pick-row${sel?.index === r.index ? ' picked' : ''}`} onClick={() => pick(r)}>
                    <td><strong>{r.index}</strong></td>
                    {unit === 'line' && <td>{r.side}</td>}
                    <td><span className={`badge state-badge st-${r.state}`}>{stateText(r.state)}</span></td>
                    <td>{r.currentLoad ? r.currentLoad.toLocaleString() : '—'}</td>
                    <td>{teamName(r.loadTeamId) || '—'}</td>
                    <td>{r.loadedAt ? <strong>{fmtDate(r.loadedAt)}</strong> : '—'}</td>
                    <td>{r.firedAt ? fmtDateTime(r.firedAt) : '—'}</td>
                    <td>{r.coalKg ? `${Number(r.coalKg).toLocaleString()} kg` : '—'}</td>
                    <td className="issues-cell">{r.issues || '—'}</td>
                  </tr>
                ))}
                {!shown.length && <tr><td colSpan={9} className="muted">{t.noEntries}</td></tr>}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* Chamber / line action panel */}
      {sel && (
        <div ref={panelRef} className="card grid kiln-panel" style={{ borderInlineStart: '5px solid var(--brand)', animation: 'slide-up 0.2s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
            {unit === 'line' && (
              <button type="button" className="ghost" aria-label={t.previous} disabled={!rows.some((x) => x.index === sel.index - 1)} onClick={() => stepSel(-1)}>‹</button>
            )}
            <h2>
              {unitLabel} #{sel.index}{unit === 'line' && sel.side ? ` (${sel.side})` : ''} — {t[STATE_LABEL_KEY[sel.state]] || sel.state}
            </h2>
            {unit === 'line' && (
              <button type="button" className="ghost" aria-label={t.next} disabled={!rows.some((x) => x.index === sel.index + 1)} onClick={() => stepSel(1)}>›</button>
            )}
            <button type="button" className="close-btn" aria-label={t.close || 'Close'} title={t.close || 'Close'} onClick={() => setSel(null)}>✕</button>
          </div>

          {msg.text && (
            <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'} style={{ margin: 0 }}>
              {msg.text}
            </p>
          )}

          {sel.state === 'Empty' && (
            <div className="grid two" style={{ gap: '0.85rem' }}>
              {inventory?.greenStock !== undefined && (
                <div style={{ gridColumn: '1 / -1', padding: '0.5rem 0.75rem', background: 'var(--brand-tint)', borderRadius: '8px', border: '1px solid rgba(234, 88, 12, 0.25)', fontSize: '0.86rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--ink)' }}>Available Green Stock:</span>
                  <strong style={{ color: 'var(--brand)', fontSize: '0.96rem' }}>{(inventory.greenStock ?? 0).toLocaleString()} bricks</strong>
                </div>
              )}
              <label>
                {t.loaderOrTeam}
                <SearchSelect
                  required ariaLabel={t.loaderOrTeam} placeholder={t.typeToSearch} value={form.teamId || ''}
                  onChange={(v) => setForm({ ...form, teamId: v })}
                  options={pickOptions('bharai')}
                />
              </label>
              <label>
                {t.kachiBharai}
                <input
                  inputMode="numeric"
                  placeholder={unit === 'line' ? 'e.g. 4000' : 'e.g. 45000'}
                  value={form.count || ''}
                  onChange={(e) => setForm({ ...form, count: e.target.value })}
                />
              </label>
              <label>
                {t.entryDate}
                <input type="date" required max={new Date().toISOString().slice(0, 10)} value={form.date || new Date().toISOString().slice(0, 10)} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </label>
              <button
                className="primary"
                disabled={!form.teamId || !form.count || submitting}
                onClick={() => loadRow(sel)}
                style={{ gridColumn: '1 / -1' }}
              >
                {submitting ? '...' : (unit === 'line' ? t.loadLine : t.loadSection)}
              </button>
              {unit === 'line' && <p className="muted" style={{ gridColumn: '1 / -1', margin: 0, fontSize: '0.8rem' }}>{t.nextLineHint}</p>}
            </div>
          )}

          {sel.state === 'Cooling' && (
            <div className="grid two" style={{ gap: '0.85rem' }}>
              <label style={{ gridColumn: '1 / -1' }}>
                {t.unloaderOrTeam}
                <SearchSelect
                  required ariaLabel={t.unloaderOrTeam} placeholder={t.typeToSearch} value={form.teamId || ''}
                  onChange={(v) => setForm({ ...form, teamId: v })}
                  options={pickOptions('nikasi')}
                />
              </label>
              <button
                className="primary"
                disabled={!form.teamId}
                onClick={() => startUnload(sel)}
                style={{ gridColumn: '1 / -1' }}
              >
                {t.assignNikasi}
              </button>
            </div>
          )}

          {sel.state === 'Unloading' && (
            <div className="grid" style={{ gap: '0.85rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
                <label>
                {t.entryDate}
                <input type="date" required max={new Date().toISOString().slice(0, 10)} value={form.date || new Date().toISOString().slice(0, 10)} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </label>
                <label>
                  {t.awwal}
                  <input inputMode="numeric" placeholder="0" value={form.awwal || ''} onChange={(e) => setForm({ ...form, awwal: e.target.value })} />
                </label>
                <label>
                  {t.doem}
                  <input inputMode="numeric" placeholder="0" value={form.doem || ''} onChange={(e) => setForm({ ...form, doem: e.target.value })} />
                </label>
                <label>
                  {t.khangar}
                  <input inputMode="numeric" placeholder="0" value={form.khangar || ''} onChange={(e) => setForm({ ...form, khangar: e.target.value })} />
                </label>
                <label>
                  {t.broken}
                  <input inputMode="numeric" placeholder="0" value={form.broken || ''} onChange={(e) => setForm({ ...form, broken: e.target.value })} />
                </label>
              </div>
              <button className="primary" onClick={() => completeUnload(sel)}>
                {t.completeUnload}
              </button>
            </div>
          )}

          {sel.state !== 'Empty' && (
            <div className="cycle-register">
              <div className="cycle-dates">
                <div><span>{t.loadedOn}</span><strong>{sel.loadedAt ? fmtDate(sel.loadedAt) : '—'}</strong></div>
                <div><span>{t.firedOn}</span><strong>{sel.firedAt ? fmtDateTime(sel.firedAt) : '—'}</strong></div>
                <div><span>{t.cooledOn}</span><strong>{sel.cooledAt ? fmtDateTime(sel.cooledAt) : '—'}</strong></div>
                <div><span>{t.kachiBharai}</span><strong>{(sel.currentLoad || 0).toLocaleString()}</strong></div>
              </div>
              <div className="grid two">
                <label>
                  {t.coalUsed}
                  <input inputMode="decimal" placeholder={t.coalUsedHint} value={notes.coalKg} onChange={(e) => setNotes({ ...notes, coalKg: e.target.value.replace(/[^\d.]/g, '') })} />
                </label>
              </div>
              <label>
                {t.issuesAndCauses}
                <textarea rows={5} className="issues-box" placeholder={t.issuesHint} value={notes.issues} onChange={(e) => setNotes({ ...notes, issues: e.target.value })} />
              </label>
              <button type="button" className="ghost" disabled={submitting} onClick={saveNotes}>{t.saveNotes}</button>
            </div>
          )}

          {history.length > 0 && (
            <div className="table-wrap cycle-history">
              <table>
                <thead>
                  <tr>
                    <th>{t.loadedOn}</th><th>{t.firedOn}</th><th>{t.unloadedOn}</th><th>{t.kachiBharai}</th>
                    <th>{t.coalUsed}</th><th>{t.awwal}</th><th>{t.doem}</th><th>{t.khangar}</th><th>{t.broken}</th><th>{t.issuesAndCauses}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h._id}>
                      <td>{h.loadedAt ? fmtDate(h.loadedAt) : '—'}</td>
                      <td>{h.firedAt ? fmtDateTime(h.firedAt) : '—'}</td>
                      <td>{fmtDate(h.unloadedAt)}</td>
                      <td>{(h.count || 0).toLocaleString()}</td>
                      <td>{h.coalKg ? `${Number(h.coalKg).toLocaleString()} kg` : '—'}</td>
                      <td>{h.awwal.toLocaleString()}</td><td>{h.doem.toLocaleString()}</td><td>{h.khangar.toLocaleString()}</td><td>{h.broken.toLocaleString()}</td>
                      <td className="issues-cell">{h.issues || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {['Loading', 'Preheating', 'Firing'].includes(sel.state) && (
            <div style={{ padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: '10px', color: 'var(--muted)', fontSize: '0.88rem' }}>
              <span>{t.inCycleHint}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
