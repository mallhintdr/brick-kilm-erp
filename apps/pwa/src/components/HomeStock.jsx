import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n.js';
import { get } from '../api.js';
import { SectionTitle, StatCard, Skeleton, StatGrid } from './ui.jsx';

const n = (v) => Math.round(Number(v || 0)).toLocaleString();

// Front-page stock box: fired bricks by grade, green bricks, bricks in the kiln and coal left.
// Other purchased items are in the goods receipt list on the Inventory page.
export default function HomeStock() {
  const t = useT();
  const [r, setR] = useState(null);
  useEffect(() => { get('/stock-report').then(setR).catch(() => {}); }, []);
  if (!r) return <Skeleton className="h-44" />;

  const cells = [
    { label: t.awwal, value: n(r.stock.awwal), tone: 'teal' },
    { label: t.doem, value: n(r.stock.doem), tone: 'blue' },
    { label: t.khangar, value: n(r.stock.khangar), tone: 'violet' },
    { label: t.hsGreen, value: n(r.stock.green), tone: 'orange' },
    { label: t.greenInKiln, value: n(r.inKiln?.green), tone: 'amber' },
    { label: t.firedInKiln, value: n(r.inKiln?.fired), tone: 'red' },
    { label: t.hsCoal, value: `${n(r.coal.remainingKg)} kg`, tone: r.coal.remainingKg < 0 ? 'pink' : 'teal', warn: r.coal.remainingKg < 0, wide: true },
  ];

  return (
    <section data-tour="stock" className="grid gap-3 rounded-lg bg-white p-3.5 ring-1 ring-n-200" aria-label={t.hsTitle}>
      <SectionTitle><Link to="/inventory" className="text-white no-underline">{t.hsTitle}</Link></SectionTitle>
      <StatGrid>
        {cells.map((c) => <StatCard key={c.label} label={c.label} value={c.value} tone={c.tone} valueClass={c.warn ? 'text-loss text-lg' : undefined} className="px-1.5" compact />)}
      </StatGrid>
    </section>
  );
}
