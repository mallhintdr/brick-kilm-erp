import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useT } from '../i18n.js';
import { get, fmtDateTime } from '../api.js';

// One page per worker, with a page-break between each — so the owner can print the whole
// settled run in one go and hand each slip out, matching brick kiln.md's printed-slip design.
export default function PrintKharchiSlip() {
  const { id } = useParams();
  const t = useT();
  const [run, setRun] = useState(null);

  useEffect(() => { get(`/kharchi-runs/${id}`).then(setRun).catch(() => {}); }, [id]);

  if (!run) return <p className="muted" style={{ padding: '1rem' }}>…</p>;

  return (
    <div className="print-page">
      <button className="no-print primary" style={{ margin: '1rem' }} onClick={() => window.print()}>{t.printSlip}</button>
      {run.items.map((it) => (
        <div className="slip slip-break" key={it.workerId}>
          <header className="slip-head">
            <strong>{t.appName}</strong>
            <span>{fmtDateTime(run.createdAt)}</span>
          </header>
          <h1>{it.name}</h1>
          <p className="muted">{t.periodStart}: {fmtDateTime(run.periodStart)} — {t.periodEnd}: {fmtDateTime(run.periodEnd)}</p>
          <div className="kpi-grid">
            <div className="stat"><span>{t.gross}</span><strong>Rs {Number(it.gross).toLocaleString()}</strong></div>
            <div className="stat"><span>{t.recovery}</span><strong className="warn">Rs {Number(it.recovery).toLocaleString()}</strong></div>
            <div className="stat"><span>{t.kharchiPaid}</span><strong className="ok">Rs {Number(it.kharchi).toLocaleString()}</strong></div>
          </div>
          <p className="muted" style={{ marginTop: '2rem' }}>{t.slipFooter}</p>
        </div>
      ))}
    </div>
  );
}
