import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n.js';
import { get, post, uuid, fmtDateTime } from '../api.js';
import { useTypes, typeLabel } from '../useTypes.js';
import { useLang } from '../i18n.js';

const isoDaysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export default function Kharchi() {
  const t = useT();
  const { lang } = useLang();
  const cats = useTypes('workerCategory');
  const [category, setCategory] = useState('pathera');
  const [periodStart, setPeriodStart] = useState(isoDaysAgo(7));
  const [periodEnd, setPeriodEnd] = useState(isoDaysAgo(0));
  const [proposal, setProposal] = useState(null);
  const [runs, setRuns] = useState([]);
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [busy, setBusy] = useState(false);

  const loadRuns = () => get('/kharchi-runs').then(setRuns).catch(() => {});
  useEffect(() => { loadRuns(); }, []);

  async function propose() {
    setMsg({ text: '', bad: false });
    setProposal(null);
    try {
      const qs = new URLSearchParams({ periodStart, periodEnd, category }).toString();
      const r = await get(`/kharchi-runs/propose?${qs}`);
      setProposal(r);
      if (!r.items.length) setMsg({ text: t.noEntries, bad: false });
    } catch (e) { setMsg({ text: e.message, bad: true }); }
  }

  function editKharchi(workerId, value) {
    setProposal((p) => ({
      ...p,
      items: p.items.map((it) => (it.workerId === workerId ? { ...it, kharchi: value, recovery: (Number(it.gross) - Number(value || 0)).toFixed(2) } : it)),
    }));
  }

  async function settle() {
    setBusy(true);
    try {
      const r = await post('/kharchi-runs', {
        periodStart, periodEnd, category,
        items: proposal.items.map((it) => ({ workerId: it.workerId, gross: it.gross, kharchi: it.kharchi })),
        clientUuid: uuid(),
      });
      setMsg({ text: r.queued ? t.queued : `${t.savedOk} — ${t.totalOut}: ${r.totalKharchi}`, bad: false });
      setProposal(null);
      loadRuns();
    } catch (e) { setMsg({ text: e.message, bad: true }); }
    setBusy(false);
  }

  const totalKharchi = proposal?.items.reduce((a, it) => a + Number(it.kharchi || 0), 0) ?? 0;
  const totalRecovery = proposal?.items.reduce((a, it) => a + Number(it.recovery || 0), 0) ?? 0;

  return (
    <div className="grid">
      {/* Run Proposal Card */}
      <div className="card grid">
        <h2>🧾 {t.kharchiRun} (ہفتہ وار خرچی تصفیہ)</h2>
        <div className="grid two" style={{ gap: '0.9rem' }}>
          <label>
            {t.category}
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {cats.active.map((c) => <option key={c.key} value={c.key}>{typeLabel(c, lang)}</option>)}
            </select>
          </label>
          <label>
            {t.periodStart}
            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </label>
          <label>
            {t.periodEnd}
            <input type="date" value={periodEnd} max={isoDaysAgo(0)} onChange={(e) => setPeriodEnd(e.target.value)} />
          </label>
        </div>
        <button className="primary" onClick={propose}>
          🧮 {t.propose}
        </button>
        {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>{msg.text}</p>}
      </div>

      {/* Calculated Proposal Table */}
      {proposal && proposal.items.length > 0 && (
        <div className="card grid" style={{ borderInlineStart: '4.5px solid var(--brand)', animation: 'fade-in 0.2s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2>📋 Settlement Proposal</h2>
            <span style={{ fontSize: '0.84rem', color: 'var(--muted)', background: '#f8fafc', padding: '0.2rem 0.6rem', borderRadius: '6px', border: '1px solid var(--line)' }}>
              {t.kharchiFormula.replace('{r}', proposal.recoveryPct).replace('{f}', proposal.kharchiFloor)}
            </span>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="rownum">#</th>
                  <th>{t.name}</th>
                  <th style={{ textAlign: 'end' }}>{t.amount} ({t.gross})</th>
                  <th style={{ textAlign: 'end' }}>{t.recovery}</th>
                  <th style={{ textAlign: 'end' }}>{t.kharchiPaid}</th>
                </tr>
              </thead>
              <tbody>
                {proposal.items.map((it, i) => (
                  <tr key={it.workerId}>
                    <td className="rownum">{i + 1}</td>
                    <td><strong>{it.name}</strong></td>
                    <td style={{ textAlign: 'end' }}>{Number(it.gross).toLocaleString()}</td>
                    <td style={{ textAlign: 'end' }} className="warn"><strong>{Number(it.recovery).toLocaleString()}</strong></td>
                    <td style={{ textAlign: 'end' }}>
                      <input
                        inputMode="decimal"
                        value={it.kharchi}
                        onChange={(e) => editKharchi(it.workerId, e.target.value)}
                        style={{ maxWidth: '8rem', minHeight: '36px', padding: '0.25rem 0.5rem', textAlign: 'end', fontWeight: 700 }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}><strong>Total:</strong></td>
                  <td style={{ textAlign: 'end' }}>{proposal.items.reduce((a, it) => a + Number(it.gross || 0), 0).toLocaleString()}</td>
                  <td style={{ textAlign: 'end' }} className="warn"><strong>{totalRecovery.toLocaleString()}</strong></td>
                  <td style={{ textAlign: 'end' }} className="ok"><strong>{totalKharchi.toLocaleString()}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <button className="primary" disabled={busy} onClick={settle}>
            💾 {t.saveAndSettle}
          </button>
        </div>
      )}

      {/* Recent Settlements */}
      <div className="card table-wrap">
        <h2>📜 {t.recentRuns} ({runs.length})</h2>
        <table>
          <thead>
            <tr>
              <th className="rownum">#</th>
              <th>{t.dateTime}</th>
              <th>{t.category}</th>
              <th>{t.workers}</th>
              <th style={{ textAlign: 'end' }}>{t.totalOut}</th>
              <th className="actions">Slip</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => (
              <tr key={r._id}>
                <td className="rownum">{i + 1}</td>
                <td>{fmtDateTime(r.createdAt)}</td>
                <td><span className="badge" style={{ background: '#f1f5f9', color: '#1e293b' }}>{cats.label(r.category)}</span></td>
                <td>{r.items?.length || '—'} workers</td>
                <td style={{ textAlign: 'end' }} className="ok"><strong>{Number(r.totalKharchi).toLocaleString()}</strong></td>
                <td className="actions">
                  <Link className="ghost" style={{ minHeight: '32px', padding: '0.2rem 0.6rem', fontSize: '0.8rem' }} to={`/print/kharchi/${r._id}`} target="_blank" rel="noopener">
                    🖨️ {t.printSlip}
                  </Link>
                </td>
              </tr>
            ))}
            {!runs.length && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                  {t.noEntries}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
