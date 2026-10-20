import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useT } from '../i18n.js';
import { get, fmtDateTime } from '../api.js';
import DateTime from '../components/DateTime.jsx';
import { Button, StatCard, Muted, tbl, cx } from '../components/ui.jsx';

// A browser-printable worker statement: Urdu text renders through the same font/engine
// as the rest of the app. The owner prints to paper or "Save as PDF" from the print dialog.
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

  if (!worker) return <Muted className="p-4">…</Muted>;

  return (
    <div className="min-h-dvh bg-n-50 p-3 print:bg-white print:p-0">
      <Button className="no-print mb-3 print:hidden" onClick={() => window.print()}>🖨️ {t.printSlip}</Button>
      <div className="mx-auto grid max-w-2xl gap-3 rounded-lg bg-white p-6 ring-1 ring-n-200 print:max-w-none print:rounded-none print:ring-0">
        <header className="flex justify-between border-b-2 border-n-900 pb-2 text-sm">
          <strong>{t.appName}</strong>
          <span>{fmtDateTime(new Date())}</span>
        </header>
        <h1 className="m-0 text-xl font-bold">{worker.name}</h1>
        <p className="m-0 text-sm text-n-600">{t.cnic}: {worker.cnic} · {t.category}: {worker.category}</p>
        <StatCard label={t.outstanding} value={`Rs ${balance ?? '—'}`} tone="amber" className="max-w-56" />
        <table className={tbl.table}>
          <thead><tr>{['#', t.dateTime, t.account, t.type, t.amount].map((h, i) => <th key={i} className={cx(i === 0 && 'rownum', tbl.th, 'print:bg-n-100 print:text-n-900')}>{h}</th>)}</tr></thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={e._id} className={tbl.tr}>
                <td className={cx('rownum', tbl.td)}>{i + 1}</td>
                <td className={tbl.td}><DateTime value={e.createdAt} /></td>
                <td className={tbl.td}>{e.account === 'peshgi' ? t.peshgi : t.earnings}</td>
                <td className={tbl.td}>{e.type}</td>
                <td className={cx(tbl.td, 'font-semibold')}>{Number(e.debit) > 0 ? `+Rs ${e.debit}` : `-Rs ${e.credit}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="m-0 mt-6 text-sm text-n-500">{t.slipFooter}</p>
      </div>
    </div>
  );
}
