import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, post, uuid } from '../api.js';
import KilnDiagram from '../components/KilnDiagram.jsx';

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

export default function KilnBoard() {
  const t = useT();
  const [sections, setSections] = useState([]);
  const [teams, setTeams] = useState([]);
  const [inventory, setInventory] = useState(null);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({});
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  const load = () => {
    get('/kiln-sections').then(setSections).catch(() => {});
    get('/teams').then(setTeams).catch(() => {});
    get('/inventory/summary').then(setInventory).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const teamsOf = (cat) => teams.filter((tm) => tm.category === cat);

  async function act(fn) {
    setMsg({ text: '', bad: false });
    setSubmitting(true);
    try {
      const r = await fn();
      setMsg({ text: r?.queued ? t.queued : t.savedOk, bad: false });
      setSel(null);
      setForm({});
      load();
    } catch (e) {
      setMsg({ text: e.message || 'Operation failed', bad: true });
    } finally {
      setSubmitting(false);
    }
  }

  const fireAdvance = async () => {
    setAdvancing(true);
    await act(() => post('/fire-advance', { clientUuid: uuid() }));
    setAdvancing(false);
  };

  const loadSection = (sec) => act(() => post(`/kiln-sections/${sec.index}/load`, {
    teamId: form.teamId,
    count: Number(form.count),
    clientUuid: uuid(),
  }));

  const startUnload = (sec) => act(() => post(`/kiln-sections/${sec.index}/unload/start`, {
    teamId: form.teamId,
    clientUuid: uuid(),
  }));

  const completeUnload = (sec) => act(() => post(`/kiln-sections/${sec.index}/unload/complete`, {
    awwal: Number(form.awwal || 0),
    doem: Number(form.doem || 0),
    khangar: Number(form.khangar || 0),
    broken: Number(form.broken || 0),
    clientUuid: uuid(),
  }));

  const firingSec = sections.find((s) => s.state === 'Firing');
  const totalInKiln = sections.reduce((acc, s) => acc + (s.currentLoad || 0), 0);

  return (
    <div className="grid">
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
              {t.firingState} {firingSec ? `#${firingSec.index}` : '—'}
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--ink)' }}>
              {totalInKiln.toLocaleString()} {t.count} in Kiln
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="primary" disabled={advancing} onClick={fireAdvance}>
            🔥 {t.advanceFire}
          </button>
        </div>
      </div>

      {msg.text && (
        <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>
          {msg.text}
        </p>
      )}

      {/* Main Diagram Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2>{t.kilnBoard}</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 600 }}>
            {t.kilnHint}
          </span>
        </div>

        <KilnDiagram sections={sections} selected={sel} onSelect={(s) => { setSel(s); setForm({}); }} t={t} />

        <div className="legend">
          {Object.entries(STATE_LABEL_KEY).map(([state, key]) => (
            <span key={state} className="legend-item">
              <i className={`dot ${STATE_CLASS[state]}`} />
              <span>{t[key]}</span>
              <b>{sections.filter((s) => s.state === state).length}</b>
            </span>
          ))}
        </div>
      </div>

      {/* Chamber Action Drawer / Panel */}
      {sel && (
        <div className="card grid" style={{ borderInlineStart: '5px solid var(--brand)', animation: 'slide-up 0.2s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>
              {t.section} #{sel.index} — {t[STATE_LABEL_KEY[sel.state]] || sel.state}
            </h2>
            <button type="button" className="ghost" style={{ minHeight: '34px', padding: '0.2rem 0.6rem' }} onClick={() => setSel(null)}>
              ✕ {t.close || 'Close'}
            </button>
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
                  <span style={{ color: 'var(--ink)' }}>🌱 Available Green Stock:</span>
                  <strong style={{ color: 'var(--brand)', fontSize: '0.96rem' }}>{(inventory.greenStock ?? 0).toLocaleString()} bricks</strong>
                </div>
              )}
              <label>
                {t.team}
                <select value={form.teamId || ''} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
                  <option value="" disabled>— {t.team} —</option>
                  {teamsOf('bharai').map((tm) => (
                    <option key={tm._id} value={tm._id}>{tm.label}</option>
                  ))}
                </select>
              </label>
              <label>
                {t.count}
                <input
                  inputMode="numeric"
                  placeholder="e.g. 45000"
                  value={form.count || ''}
                  onChange={(e) => setForm({ ...form, count: e.target.value })}
                />
              </label>
              <button
                className="primary"
                disabled={!form.teamId || !form.count || submitting}
                onClick={() => loadSection(sel)}
                style={{ gridColumn: '1 / -1' }}
              >
                {submitting ? '...' : `📥 ${t.loadSection}`}
              </button>
            </div>
          )}

          {sel.state === 'Cooling' && (
            <div className="grid two" style={{ gap: '0.85rem' }}>
              <label style={{ gridColumn: '1 / -1' }}>
                {t.team}
                <select value={form.teamId || ''} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
                  <option value="" disabled>— {t.team} —</option>
                  {teamsOf('nikasi').map((tm) => (
                    <option key={tm._id} value={tm._id}>{tm.label}</option>
                  ))}
                </select>
              </label>
              <button
                className="primary"
                disabled={!form.teamId}
                onClick={() => startUnload(sel)}
                style={{ gridColumn: '1 / -1' }}
              >
                🏗️ {t.assignNikasi}
              </button>
            </div>
          )}

          {sel.state === 'Unloading' && (
            <div className="grid" style={{ gap: '0.85rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
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
                💾 {t.completeUnload}
              </button>
            </div>
          )}

          {['Loading', 'Preheating', 'Firing'].includes(sel.state) && (
            <div style={{ padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: '10px', color: 'var(--muted)', fontSize: '0.88rem' }}>
              <span>Chamber is currently in cycle. Advances automatically with fire progression.</span>
              {sel.currentLoad > 0 && <div style={{ marginTop: '0.25rem', fontWeight: 700, color: 'var(--ink)' }}>Current Bricks: {sel.currentLoad.toLocaleString()}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
