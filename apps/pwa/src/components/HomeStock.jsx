import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n.js';
import { get } from '../api.js';
import { SectionTitle, StatCard } from './ui.jsx';

const n = (v) => Math.round(Number(v || 0)).toLocaleString();

// Front-page stock box: fired bricks by grade, green bricks, bricks in the kiln and coal left.
// Other purchased items are in the goods receipt list on the Inventory page.
export default function HomeStock() {
  const t = useT();
  const [r, setR] = useState(null);
  useEffect(() => { get('/stock-report').then(setR).catch(() => {}); }, []);
  if (!r) return null;

  const cells = [
    { label: t.awwal, value: n(r.stock.awwal), tone: 'teal' },
    { label: t.doem, value: n(r.stock.doem), tone: 'blue' },
    { label: t.khangar, value: n(r.stock.khangar), tone: 'violet' },
    { label: t.hsGreen, value: n(r.stock.green), tone: 'orange' },
    { label: t.hsInKiln, value: n(r.jalai.bricksInKiln), tone: 'pink' },
    { label: t.hsCoal, value: `${n(r.coal.remainingKg)} kg`, tone: r.coal.remainingKg < 0 ? 'pink' : 'teal', warn: r.coal.remainingKg < 0 },
  ];

  return (
    <section className="grid gap-3 rounded-lg bg-white p-3.5 ring-1 ring-n-200" aria-label={t.hsTitle}>
      <SectionTitle><Link to="/inventory" className="text-n-900 no-underline">{t.hsTitle}</Link></SectionTitle>
      <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
        {cells.map((c) => <StatCard key={c.label} label={c.label} value={c.value} tone={c.tone} valueClass={c.warn ? 'text-loss text-lg' : undefined} className="px-1.5" />)}
      </div>
    </section>
  );
}
