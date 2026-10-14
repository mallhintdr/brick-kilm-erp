import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useT } from '../i18n.js';
import { get, fmtDateTime } from '../api.js';
import DateTime from '../components/DateTime.jsx';

// A browser-printable worker statement: Urdu text renders through the same font/engine
// as the rest of the app, so there's no separate PDF-library text-shaping risk. The
// owner prints to paper or "Save as PDF" from the browser's own print dialog.
export default function PrintWorkerSlip() {
  const { id } = useParams();
  const t = useT();
  const [worker, setWorker] = useState(null);
  const [entries, setEntries] = useState([]);
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    get(`/workers/${id}`).then(setWorker).catch(() => {});
    get(`/workers/${id}/ledger`).then(setEntries).catch(() => {});
    get(`/workers/${id}/peshgi`).then((r) => setBalance(r.outstanding)).catch(() => {});
  }, [id]);

  if (!worker) return <p className="muted" style={{ padding: '1rem' }}>…</p>;

  return (
    <div className="print-page">
      <button className="no-print primary" style={{ margin: '1rem' }} onClick={() => window.print()}>{t.printSlip}</button>
      <div className="slip">
        <header className="slip-head">
          <strong>{t.appName}</strong>
          <span>{fmtDateTime(new Date())}</span>
        </header>
        <h1>{worker.name}</h1>
        <p className="muted">{t.cnic}: {worker.cnic} · {t.category}: {worker.category}</p>
        <div className="stat"><span>{t.outstanding}</span><strong>Rs {balance ?? '—'}</strong></div>

        <table>
          <thead><tr><th className="rownum">#</th><th>{t.dateTime}</th><th>{t.account}</th><th>{t.type}</th><th>{t.amount}</th></tr></thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={e._id}>
                <td className="rownum">{i + 1}</td>
                <td><DateTime value={e.createdAt} /></td>
                <td>{e.account === 'peshgi' ? t.peshgi : t.earnings}</td>
                <td>{e.type}</td>
                <td>{Number(e.debit) > 0 ? `+Rs ${e.debit}` : `-Rs ${e.credit}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: '2rem' }}>{t.slipFooter}</p>
      </div>
    </div>
  );
}
