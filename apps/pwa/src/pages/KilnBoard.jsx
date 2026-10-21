import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../i18n.js';
import { get, post, put, del, uuid, getRole, fmtDate, fmtDateTime } from '../api.js';
import KilnDiagram from '../components/KilnDiagram.jsx';
import LineDiagram, { LINE_FILL } from '../components/LineDiagram.jsx';
import KilnLegend from '../components/KilnLegend.jsx';
import { Card, CardHeader, CardBody, Field, Input, Textarea, FormGrid, Button, IconButton, Alert, Muted, Tabs, TableCard, tbl, FilterInput, ClearFilters, Empty, cx } from '../components/ui.jsx';
import SearchSelect from '../components/SearchSelect.jsx';
import WorkWeekGrid from '../components/WorkWeekGrid.jsx';
import { Pencil, Undo2, X } from 'lucide-react';

const STATE_LABEL_KEY = {
  Empty: 'empty',
  Loading: 'loading',
  Preheating: 'preheating',
  Firing: 'firingState',
  Cooling: 'cooling',
  Ready: 'readyToUnload',
  Unloading: 'unloading',
};


// A kiln is counted either by chambers or by lines (the owner picks); both run the same cycle.
const UNIT_PATH = { chamber: 'kiln-sections', line: 'kiln-lines' };

// focus: 'load' opens the first empty chamber/line (bharai); 'unload' the first one cooled or unloading (nikasi).
export default function KilnBoard({ focus } = {}) {
  const t = useT();
  const isOwner = getRole() === 'owner';
  const navigate = useNavigate();
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
  const [fireAt, setFireAt] = useState(''); // blank = now; a past date-time for old records
  const [fire, setFire] = useState(null); // { index } where the fire is now (lines)
  const [workers, setWorkers] = useState([]);
  const [notes, setNotes] = useState({ coalKg: '', issues: '' });
  const [history, setHistory] = useState([]);
  const [lf, setLf] = useState({}); // list filters
  const [loadEdit, setLoadEdit] = useState(null); // owner correcting a load: { who, count, date }
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
    get('/kiln-fire').then(setFire).catch(() => setFire(null));
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
      const want = focus === 'load' ? ['Empty'] : focus === 'unload' ? ['Unloading', 'Ready', 'Cooling'] : null;
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
    ...teamsOf(cat).filter((tm) => tm.solo).map((tm) => ({ value: `t:${tm._id}`, label: teamText(tm), search: '' })),
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

  // owner: correct or undo the current load (wages follow automatically)
  const startLoadEdit = () => setLoadEdit({
    who: sel.loadTeamId ? `t:${sel.loadTeamId}` : '', count: String(sel.currentLoad || ''),
    date: sel.loadedAt ? new Date(sel.loadedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
  });
  const saveLoadEdit = () => act(() => put(`${base}/${sel.index}/load`, {
    ...who(loadEdit.who), count: Number(loadEdit.count), date: loadEdit.date,
  }).then((r) => { setLoadEdit(null); return r; }), { keep: true });
  const undoLoad = () => {
    if (!window.confirm(`${t.undoLoading}: ${unitLabel} ${sel.index}?`)) return;
    setLoadEdit(null);
    act(() => del(`${base}/${sel.index}/load`));
  };
  useEffect(() => { setLoadEdit(null); }, [sel?.index]);

  // stage buttons: Loading > Preheating > Firing > Cooling > Unloading, one step at a time
  const STAGES = ['Loading', 'Preheating', 'Firing', 'Cooling', 'Unloading'];
  const stageOf = (row) => ({ Empty: 0, Loading: 0, Preheating: 1, Firing: 2, Cooling: 3, Ready: 3, Unloading: 4 }[row?.state] ?? 0);
  const stageForm = useRef(null);
  const goStage = (st) => {
    if (st === 'Firing') {
      // firing is entered on the firing form (line, time, coal); the board follows it
      if (unit === 'line') navigate(`/firing?line=${sel.index}`);
      else act(() => post('/kiln-fire/start', { index: sel.index, ...(fireAt ? { at: new Date(fireAt).toISOString() } : {}) }), { keep: true });
    } else if (st === 'Preheating') {
      act(() => post(`${base}/${sel.index}/stage`, { stage: 'Preheating' }), { keep: true });
    } else if (st === 'Cooling') {
      act(() => post(`${base}/${sel.index}/stage`, { stage: 'Cooling', ...(fireAt ? { at: new Date(fireAt).toISOString() } : {}) }), { keep: true });
    } else {
      // Loading and Unloading open their forms below
      stageForm.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

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
    await act(() => post('/fire-advance', { unit, steps: unit === 'line' ? Number(steps) || 1 : 1, ...(fireAt ? { at: new Date(fireAt).toISOString() } : {}), clientUuid: uuid() }));
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
    date: form.date || new Date().toISOString().slice(0, 10),
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

  const todayIso = new Date().toISOString().slice(0, 10);
  const dateBox = (k = 'date') => (
    <Input type="date" required max={todayIso} value={form[k] || todayIso} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
  );
  const teamName = (id) => teams.find((tm) => tm._id === id)?.label || '';
  const stateText = (st) => t[STATE_LABEL_KEY[st]] || st;
  const coalOf = (r) => (r.coalKg || 0) + (r.logCoalKg || 0);
  const cols = [
    ['index', (r) => r.index, unitLabel], ['round', (r) => r.round || '', t.round], ['state', (r) => stateText(r.state), t.status],
    ['count', (r) => r.currentLoad || 0, t.kachiBharai], ['team', (r) => teamName(r.loadTeamId), t.team],
    ['loaded', (r) => (r.loadedAt ? fmtDate(r.loadedAt) : ''), t.loadedOn], ['fired', (r) => (r.firedAt ? fmtDateTime(r.firedAt) : ''), t.firedOn],
    ['coal', (r) => coalOf(r) || '', t.coalUsed], ['issues', (r) => r.issues || '', t.issuesAndCauses],
  ];
  const shownRows = rows.filter((r) => cols.every(([k, g]) => !lf[k] || String(g(r)).toLowerCase().includes(lf[k].toLowerCase())));

  return (
    <div className="grid gap-4">
      {/* Loading / Unloading pages: weekly entry per worker, like moulding */}
      {focus === 'load' && <WorkWeekGrid kind="bharai" />}
      {focus === 'unload' && <WorkWeekGrid kind="nikasi" />}

      {/* what is burning and how much is in the kiln; how the kiln is counted */}
      <Card>
        <CardBody className="gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="flex items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-200">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2c1.5 3-1.5 4.5-1.5 7.5a4 4 0 0 0 7.5 2c0-2-1-3-1-4.5 3.5 2.5 4.5 6 4 9A8 8 0 0 1 4 14c0-4.5 4-6.5 4-10 1.5 0 2 1 2.5 2 0-2 1-3.5 1.5-4z" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-n-500">
                🔥 {t.firingState}: {firing.length ? `${unitLabel} ${firing.map((f) => f.index).join(', ')}` : t.fireNotStarted}
              </div>
              <div className="text-lg font-extrabold text-n-900 tabular-nums">{totalInKiln.toLocaleString()} <span className="text-sm font-semibold text-n-500">{t.srBricksInKiln}</span></div>
            </div>
          </div>
          <div className="grid gap-2 sm:min-w-64">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-n-500">{t.countBy}</span>
              <div className="flex-1">
                <Tabs size="sm" value={unit} onChange={(u) => switchUnit(u)} options={[['chamber', t.chambers], ['line', t.lines]]} />
              </div>
            </div>
            {unit === 'chamber' && (
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
                <Field label={t.linesPerAdvance}><Input inputMode="numeric" className="min-h-10" value={steps} onChange={(e) => setSteps(e.target.value.replace(/[^\d]/g, ''))} /></Field>
                <Field label={t.fireTime}>
                  <Input type="datetime-local" className="min-h-10" value={fireAt} title={t.fireTimeHint} onChange={(e) => setFireAt(e.target.value)}
                    max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} />
                </Field>
                <Button size="sm" className="min-h-10" loading={advancing} disabled={!unit} onClick={fireAdvance}>🔥 {t.advanceFire}</Button>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {msg.text && !sel && <Alert tone={msg.bad ? 'err' : 'ok'}>{msg.text}</Alert>}

      {/* the plan and, beside it on wide screens, the panel for the chosen line */}
      <div className={cx('grid items-start gap-4', sel && 'xl:grid-cols-2')}>
        <div ref={planRef}>
          <Card>
            <CardHeader title={`${t.kilnBoard} — ${unit === 'line' ? t.lines : t.chambers}`} />
            <CardBody>
              <p className="m-0 text-center text-xs text-n-500">{unit === 'line' ? t.kilnLinesHint : t.kilnHint}</p>
              <KilnLegend rows={rows} t={t} states={unit === 'line' ? undefined : ['Empty', 'Loading', 'Preheating', 'Firing', 'Cooling', 'Unloading']} />
              {unit === 'line'
                ? <LineDiagram lines={rows} selected={sel} onSelect={pick} t={t} fireIndex={fire?.index} mode={focus === 'load' ? 'load' : focus === 'unload' ? 'unload' : 'fire'} />
                : unit && <KilnDiagram sections={rows} selected={sel} onSelect={pick} t={t} />}
            </CardBody>
          </Card>
        </div>

        {sel && (
          <>
          {/* phones/tablets: the panel slides up over the plan; wide screens: it sits beside the plan */}
          <div className="fixed inset-0 z-40 animate-[fade-in_.16s_ease-out] bg-n-900/40 xl:hidden" onClick={() => setSel(null)} aria-hidden="true" />
          <div ref={panelRef} className="fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] animate-[sheet-up_.22s_cubic-bezier(.2,.8,.2,1)] overflow-y-auto rounded-t-2xl xl:static xl:sticky xl:top-20 xl:z-auto xl:max-h-none xl:animate-none xl:overflow-visible xl:rounded-none">
            <Card className="overflow-hidden rounded-b-none ring-2 ring-brand-300 xl:rounded-lg">
              {/* ‹  Line 131 · Round 2 — Firing  ›  ✕ */}
              <div className="flex items-center gap-1.5 border-b border-n-100 bg-brand-50 px-2 py-2">
                {unit === 'line' && <IconButton label={t.previous} disabled={!rows.some((x) => x.index === sel.index - 1)} onClick={() => stepSel(-1)} className="bg-white text-lg ring-1 ring-n-300 disabled:opacity-40">‹</IconButton>}
                <h2 className="m-0 min-w-0 flex-1 truncate text-center text-base font-bold text-n-900">
                  {unitLabel} {sel.index}{sel.round ? ` · ${t.round} ${sel.round}` : ''} — {stateText(sel.state)}
                </h2>
                {unit === 'line' && <IconButton label={t.next} disabled={!rows.some((x) => x.index === sel.index + 1)} onClick={() => stepSel(1)} className="bg-white text-lg ring-1 ring-n-300 disabled:opacity-40">›</IconButton>}
                <IconButton label={t.close || 'Close'} onClick={() => setSel(null)} className="bg-white ring-1 ring-n-300">✕</IconButton>
              </div>

              <CardBody>
                {/* stage buttons, in the colours of the plan: Loading > Preheating > Firing > Cooling > Unloading */}
                {unit === 'line' && (() => {
                  const cur = stageOf(sel);
                  const label = { Loading: t.loading, Preheating: t.preheating, Firing: t.firingState, Cooling: t.cooling, Unloading: t.unloading };
                  return (
                    <div className="grid grid-cols-6 gap-1.5" role="group" aria-label={t.stages}>
                      {STAGES.map((st, i) => {
                        const done = i < cur || (i === cur && st === 'Cooling' && sel.state === 'Ready');
                        const now = i === cur && !done;
                        const next = i === cur + 1 || (cur === 0 && i === 0 && !sel.currentLoad);
                        // Preheating is marked by hand; Firing can follow loading or preheating
                        const loaded = sel.currentLoad > 0;
                        const can = (next && !(st === 'Unloading' && cur < 3) && !(st === 'Preheating' && !loaded)) || (st === 'Firing' && loaded && cur <= 1);
                        return (
                          <button key={st} type="button" disabled={!can} aria-current={now ? 'step' : undefined} onClick={() => goStage(st)}
                            className={cx('min-h-9 truncate rounded-md border-0 px-1 text-xs font-bold text-white transition', i < 3 ? 'col-span-2' : 'col-span-3',
                              now && 'ring-2 ring-n-900 ring-offset-1', done && 'opacity-55', !can && !now && !done && 'opacity-40')}
                            style={{ background: LINE_FILL[st], textShadow: '0 1px 1px rgba(0,0,0,.25)' }}>
                            {done ? '✓ ' : ''}{label[st]}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                {msg.text && <Alert tone={msg.bad ? 'err' : 'ok'}>{msg.text}</Alert>}
                <div ref={stageForm} />

                {/* load an empty line */}
                {sel.state === 'Empty' && (
                  <div className="grid gap-3">
                    {inventory?.greenStock !== undefined && (
                      <div className="flex items-center justify-between rounded-md bg-brand-50 px-3 py-2 text-md ring-1 ring-brand-200">
                        <span className="text-n-700">{t.greenStock}</span>
                        <strong className="text-brand-700 tabular-nums">{(inventory.greenStock ?? 0).toLocaleString()}</strong>
                      </div>
                    )}
                    <FormGrid>
                      <Field label={t.loaderOrTeam} className="sm:col-span-2">
                        <SearchSelect required ariaLabel={t.loaderOrTeam} placeholder={t.typeToSearch} value={form.teamId || ''}
                          onChange={(v) => setForm({ ...form, teamId: v })} options={pickOptions('bharai')} />
                      </Field>
                      <Field label={t.kachiBharai}><Input inputMode="numeric" placeholder={unit === 'line' ? '4000' : '45000'} value={form.count || ''} onChange={(e) => setForm({ ...form, count: e.target.value })} /></Field>
                      <Field label={t.entryDate}>{dateBox()}</Field>
                    </FormGrid>
                    <Button block loading={submitting} disabled={!form.teamId || !form.count} onClick={() => loadRow(sel)}>{unit === 'line' ? t.loadLine : t.loadSection}</Button>
                    {unit === 'line' && <Muted className="text-xs">{t.nextLineHint}</Muted>}
                  </div>
                )}

                {unit === 'line' && sel.state === 'Cooling' && sel.stage !== 'Cooling' && <Muted>{t.stillHot}</Muted>}

                {/* start nikasi */}
                {(unit === 'line' ? (sel.state === 'Ready' || sel.stage === 'Cooling') : sel.state === 'Cooling') && (
                  <div className="grid gap-3">
                    <FormGrid>
                      <Field label={t.unloaderOrTeam} className="sm:col-span-2">
                        <SearchSelect required ariaLabel={t.unloaderOrTeam} placeholder={t.typeToSearch} value={form.teamId || ''}
                          onChange={(v) => setForm({ ...form, teamId: v })} options={pickOptions('nikasi')} />
                      </Field>
                      <Field label={t.entryDate}>{dateBox()}</Field>
                    </FormGrid>
                    <Button block disabled={!form.teamId} onClick={() => startUnload(sel)}>{t.assignNikasi}</Button>
                  </div>
                )}

                {/* finish nikasi: bricks by grade */}
                {sel.state === 'Unloading' && (
                  <div className="grid gap-3">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      <Field label={t.entryDate} className="col-span-2 sm:col-span-1">{dateBox()}</Field>
                      {['awwal', 'doem', 'khangar', 'broken'].map((k) => (
                        <Field key={k} label={t[k]}><Input inputMode="numeric" placeholder="0" value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>
                      ))}
                    </div>
                    <Button block onClick={() => completeUnload(sel)}>{t.completeUnload}</Button>
                    {isOwner && (
                      <Button variant="dangerGhost" onClick={() => {
                        if (window.confirm(`${t.cancelNikasi}: ${unitLabel} ${sel.index}?`)) act(() => post(`${base}/${sel.index}/unload/cancel`, {}), { keep: true });
                      }}><X className="size-4 shrink-0" aria-hidden="true" /> {t.cancelNikasi}</Button>
                    )}
                  </div>
                )}

                {/* this cycle: dates, coal and issues; owner can correct the load */}
                {sel.state !== 'Empty' && (
                  <div className="grid gap-3 border-t border-n-100 pt-3">
                    {isOwner && sel.currentLoad > 0 && !loadEdit && (
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button size="sm" variant="secondary" onClick={startLoadEdit}><Pencil className="size-4 shrink-0" aria-hidden="true" /> {t.editLoading}</Button>
                        {['Preheating', 'Loading'].includes(sel.state) && !sel.firedAt && <Button size="sm" variant="dangerGhost" onClick={undoLoad}><Undo2 className="size-4 shrink-0" aria-hidden="true" /> {t.undoLoading}</Button>}
                      </div>
                    )}
                    {loadEdit && (
                      <div className="grid gap-3 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200">
                        <FormGrid>
                          <Field label={t.loaderOrTeam} className="sm:col-span-2">
                            <SearchSelect ariaLabel={t.loaderOrTeam} placeholder={t.typeToSearch} value={loadEdit.who}
                              onChange={(v) => setLoadEdit({ ...loadEdit, who: v })} options={pickOptions('bharai')} />
                          </Field>
                          <Field label={t.kachiBharai}><Input inputMode="numeric" value={loadEdit.count} onChange={(e) => setLoadEdit({ ...loadEdit, count: e.target.value.replace(/[^\d]/g, '') })} /></Field>
                          <Field label={t.entryDate}><Input type="date" max={todayIso} value={loadEdit.date} onChange={(e) => setLoadEdit({ ...loadEdit, date: e.target.value })} /></Field>
                        </FormGrid>
                        <div className="flex justify-center gap-2">
                          <Button disabled={submitting || !Number(loadEdit.count)} onClick={saveLoadEdit}>{t.save}</Button>
                          <Button variant="secondary" onClick={() => setLoadEdit(null)}>{t.cancel}</Button>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {[
                        [t.loadedOn, sel.loadedAt ? fmtDate(sel.loadedAt) : '—'],
                        [t.firedOn, sel.firedAt ? fmtDateTime(sel.firedAt) : '—'],
                        [t.cooledOn, sel.cooledAt ? fmtDateTime(sel.cooledAt) : '—'],
                        [t.kachiBharai, (sel.currentLoad || 0).toLocaleString()],
                        ...(sel.logCoalKg > 0 ? [[t.coalFromLogs, `${sel.logCoalKg.toLocaleString()} kg`]] : []),
                      ].map(([k, v]) => (
                        <div key={k} className="grid gap-0.5 rounded-md bg-n-50 px-2.5 py-2 text-center ring-1 ring-n-200">
                          <span className="truncate text-xs font-semibold text-n-500">{k}</span>
                          <strong className="text-md text-n-900 tabular-nums">{v}</strong>
                        </div>
                      ))}
                    </div>
                    <Field label={t.coalUsed}>
                      <Input inputMode="decimal" placeholder={t.coalUsedHint} value={notes.coalKg} onChange={(e) => setNotes({ ...notes, coalKg: e.target.value.replace(/[^\d.]/g, '') })} />
                    </Field>
                    <Field label={t.issuesAndCauses}>
                      <Textarea rows={4} placeholder={t.issuesHint} value={notes.issues} onChange={(e) => setNotes({ ...notes, issues: e.target.value })} />
                    </Field>
                    <Button variant="secondary" disabled={submitting} onClick={saveNotes}>{t.saveNotes}</Button>
                  </div>
                )}

                {['Loading', 'Preheating', 'Firing'].includes(sel.state) && <Muted className="rounded-md bg-n-50 px-3 py-2">{t.inCycleHint}</Muted>}

                {/* earlier rounds of this line */}
                {history.length > 0 && (
                  <div className="table-wrap overflow-x-auto rounded-lg ring-1 ring-n-200">
                    <table className={cx(tbl.table, 'text-sm')}>
                      <thead>
                        <tr>{[t.loadedOn, t.firedOn, t.unloadedOn, t.kachiBharai, t.coalUsed, t.awwal, t.doem, t.khangar, t.broken, t.issuesAndCauses].map((h) => <th key={h} className={tbl.th}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {history.map((h) => (
                          <tr key={h._id} className={tbl.tr}>
                            <td className={tbl.td}>{h.loadedAt ? fmtDate(h.loadedAt) : '—'}</td>
                            <td className={tbl.td}>{h.firedAt ? fmtDateTime(h.firedAt) : '—'}</td>
                            <td className={tbl.td}>{fmtDate(h.unloadedAt)}</td>
                            <td className={tbl.td}>{(h.count || 0).toLocaleString()}</td>
                            <td className={tbl.td}>{coalOf(h) ? `${coalOf(h).toLocaleString()} kg` : '—'}</td>
                            <td className={tbl.td}>{(h.awwal || 0).toLocaleString()}</td><td className={tbl.td}>{(h.doem || 0).toLocaleString()}</td>
                            <td className={tbl.td}>{(h.khangar || 0).toLocaleString()}</td><td className={tbl.td}>{(h.broken || 0).toLocaleString()}</td>
                            <td className={cx(tbl.td, 'min-w-40 whitespace-normal text-start')}>{h.issues || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
          </>
        )}
      </div>

      {/* every chamber / line as a list (tap a row to open it) */}
      <TableCard
        title={`${unit === 'line' ? t.lines : t.chambers} (${shownRows.length} / ${rows.length})`}
        actions={<ClearFilters show={Object.values(lf).some(Boolean)} onClick={() => setLf({})} label={t.clearAll} />}
      >
        <table className={tbl.table}>
          <thead>
            <tr>{cols.map(([k, , label]) => <th key={k} className={cx(k === 'index' && 'sticky-col', tbl.th)}>{label}</th>)}</tr>
            <tr className="filter-row">
              {cols.map(([k, , label]) => (
                <th key={k} className={cx(k === 'index' && 'sticky-col', tbl.fth)}><FilterInput aria-label={label} value={lf[k] || ''} onChange={(e) => setLf({ ...lf, [k]: e.target.value })} /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shownRows.map((r) => (
              <tr key={r.index} className={cx(tbl.tr, 'cursor-pointer', sel?.index === r.index && 'bg-amber-100!')} onClick={() => pick(r)}>
                <td className={cx(tbl.td, 'font-bold')}>{r.index}</td>
                <td className={tbl.td}>{r.round || '—'}</td>
                <td className={tbl.td}>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{ background: `color-mix(in srgb, ${LINE_FILL[r.state] || LINE_FILL.Empty} 18%, #fff)`, color: `color-mix(in srgb, ${LINE_FILL[r.state] || LINE_FILL.Empty} 70%, #1c1917)` }}>
                    <span className="size-2 rounded-full" style={{ background: LINE_FILL[r.state] || LINE_FILL.Empty }} />{stateText(r.state)}
                  </span>
                </td>
                <td className={tbl.td}>{r.currentLoad ? r.currentLoad.toLocaleString() : '—'}</td>
                <td className={tbl.td}>{teamName(r.loadTeamId) || '—'}</td>
                <td className={cx(tbl.td, 'font-semibold')}>{r.loadedAt ? fmtDate(r.loadedAt) : '—'}</td>
                <td className={tbl.td}>{r.firedAt ? fmtDateTime(r.firedAt) : '—'}</td>
                <td className={tbl.td}>{coalOf(r) ? `${coalOf(r).toLocaleString()} kg` : '—'}</td>
                <td className={cx(tbl.td, 'min-w-40 whitespace-normal text-start')}>{r.issues || '—'}</td>
              </tr>
            ))}
            {!shownRows.length && <Empty cols={9}>{t.noEntries}</Empty>}
          </tbody>
        </table>
      </TableCard>
    </div>
  );
}
