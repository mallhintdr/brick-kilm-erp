import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, Share2 } from 'lucide-react';
import { useT } from '../i18n.js';
import { get, fmtDateTime } from '../api.js';
import { Button, Muted } from '../components/ui.jsx';

// Delivery challan for one truck/trolley: print it, or send it to the customer on WhatsApp.
export default function PrintChallan() {
  const { id } = useParams();
  const t = useT();
  const [c, setC] = useState(null);
  useEffect(() => { get(`/invoices/${id}`).then(setC).catch(() => {}); }, [id]);
  if (!c) return <Muted className="p-4">…</Muted>;
  const n = (v) => Number(v || 0).toLocaleString();
  const total = Number(c.amount) + Number(c.tax || 0);
  const rows = [
    [t.challanNo, c.challanNo || '—'], [t.date, fmtDateTime(c.date)], [t.customer, c.customerName],
    [t.grade, t[c.grade] || c.grade], [t.quantity, n(c.qty)], [t.rate, n(c.rate)], [t.total, n(total)],
    [t.vehicle, c.vehicleNo || '—'], [t.driver, c.driver || '—'], [t.destination, c.destination || '—'], [t.freight, c.freight || '—'],
  ];
  const text = `${t.appName}\n${t.challan} #${c.challanNo || ''}\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}`;
  const phone = String(c.customerPhone || '').replace(/\D/g, '').replace(/^0/, '92');
  return (
    <div className="min-h-dvh bg-n-50 p-3 print:bg-white print:p-0">
      <div className="mb-3 flex gap-2 print:hidden">
        <Button onClick={() => window.print()}><Printer className="size-4" /> {t.printSlip}</Button>
        <Button variant="secondary" onClick={() => window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')}><Share2 className="size-4" /> WhatsApp</Button>
      </div>
      <div className="mx-auto grid max-w-md gap-3 rounded-lg bg-white p-5 ring-1 ring-n-200 print:max-w-none print:ring-0">
        <header className="flex items-end justify-between border-b-2 border-n-900 pb-2">
          <strong className="text-lg">{t.appName}</strong>
          <span className="text-sm font-bold">{t.challan} #{c.challanNo || '—'}</span>
        </header>
        <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-1.5 text-md">
          {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-n-500">{k}</dt><dd className="m-0 text-end font-semibold">{v}</dd></div>)}
        </dl>
        <div className="mt-8 grid grid-cols-2 gap-6 text-center text-xs text-n-500">
          <span className="border-t border-n-400 pt-1">{t.munshiSign}</span><span className="border-t border-n-400 pt-1">{t.driverSign}</span>
        </div>
      </div>
    </div>
  );
}
