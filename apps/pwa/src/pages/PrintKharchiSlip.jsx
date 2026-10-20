import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useT } from '../i18n.js';
import { get, fmtDateTime } from '../api.js';
import { Button, StatCard, Muted } from '../components/ui.jsx';

// One page per worker, with a page-break between each — so the owner can print the whole
// settled run in one go and hand each slip out.
export default function PrintKharchiSlip() {
  const { id } = useParams();
  const t = useT();
  const [run, setRun] = useState(null);

  useEffect(() => { get(`/kharchi-runs/${id}`).then(setRun).catch(() => {}); }, [id]);

  if (!run) return <Muted className="p-4">…</Muted>;

  return (
    <div className="min-h-dvh bg-n-50 p-3 print:bg-white print:p-0">
      <Button className="no-print mb-3 print:hidden" onClick={() => window.print()}>🖨️ {t.printSlip}</Button>
      {run.items.map((it) => (
        <div key={it.workerId} className="mx-auto mb-4 grid max-w-xl gap-3 break-after-page rounded-lg bg-white p-6 ring-1 ring-n-200 print:mb-0 print:max-w-none print:rounded-none print:ring-0">
          <header className="flex justify-between border-b-2 border-n-900 pb-2 text-sm">
            <strong>{t.appName}</strong>
            <span>{fmtDateTime(run.createdAt)}</span>
          </header>
          <h1 className="m-0 text-xl font-bold">{it.name}</h1>
          <p className="m-0 text-sm text-n-600">{t.periodStart}: {fmtDateTime(run.periodStart)} — {t.periodEnd}: {fmtDateTime(run.periodEnd)}</p>
          <div className="grid grid-cols-3 gap-2">
            <StatCard label={t.gross} value={`Rs ${Number(it.gross).toLocaleString()}`} tone="slate" />
            <StatCard label={t.recovery} value={`Rs ${Number(it.recovery).toLocaleString()}`} tone="amber" />
            <StatCard label={t.kharchiPaid} value={`Rs ${Number(it.kharchi).toLocaleString()}`} tone="green" />
          </div>
          <p className="m-0 mt-6 text-sm text-n-500">{t.slipFooter}</p>
        </div>
      ))}
    </div>
  );
}
