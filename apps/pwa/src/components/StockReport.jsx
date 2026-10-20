import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get } from '../api.js';
import { Section, StatGrid, StatCard } from './ui.jsx';

const n = (v) => Number(v || 0).toLocaleString();

// Stock report in info cards: moulding -> kachi bharai -> jalai -> nikasi -> sales, plus coal and stock left.
export default function StockReport() {
  const t = useT();
  const [r, setR] = useState(null);
  useEffect(() => { get('/stock-report').then(setR).catch(() => {}); }, []);
  if (!r) return null;
  const unitWord = r.unit === 'line' ? t.lines : t.chambers;

  const Group = ({ title, children }) => (
    <Section title={title}>
      <StatGrid className="sm:grid-cols-4 lg:grid-cols-4">{children}</StatGrid>
    </Section>
  );
  const Card = ({ label, value, tone }) => <StatCard label={label} value={value} tone={tone} />;

  return (
    <div className="grid gap-4">
      <Group title={t.srMoulding}>
        <Card label={t.srMoulded} value={n(r.moulding.moulded)} tone="orange" />
        <Card label={t.netCount} value={n(r.moulding.net)} tone="teal" />
      </Group>
      <Group title={t.kachiBharai}>
        <Card label={t.srLoaded} value={n(r.kachiBharai)} tone="blue" />
      </Group>
      <Group title={`${t.srJalai} (${unitWord})`}>
        <Card label={t.preheating} value={n(r.jalai.preheating)} tone="orange" />
        <Card label={t.firingState} value={n(r.jalai.firing)} tone="pink" />
        <Card label={t.cooling} value={n(r.jalai.cooling)} tone="violet" />
        <Card label={t.srBricksInKiln} value={n(r.jalai.bricksInKiln)} tone="blue" />
      </Group>
      <Group title={t.nikasiOutput}>
        <Card label={t.awwal} value={n(r.nikasi.awwal)} tone="teal" />
        <Card label={t.doem} value={n(r.nikasi.doem)} tone="blue" />
        <Card label={t.khangar} value={n(r.nikasi.khangar)} tone="orange" />
        <Card label={t.broken} value={n(r.nikasi.broken)} tone="pink" />
      </Group>
      <Group title={t.srSales}>
        <Card label={t.awwal} value={n(r.sales.awwal)} tone="teal" />
        <Card label={t.doem} value={n(r.sales.doem)} tone="blue" />
        <Card label={t.khangar} value={n(r.sales.khangar)} tone="orange" />
      </Group>
      <Group title={t.srCoal}>
        <Card label={t.srCoalIn} value={`${n(r.coal.inKg)} kg`} tone="blue" />
        <Card label={t.srCoalUsed} value={`${n(r.coal.usedKg)} kg`} tone="pink" />
        <Card label={t.srCoalLeft} value={`${n(r.coal.remainingKg)} kg`} tone={r.coal.remainingKg < 0 ? 'pink' : 'teal'} />
      </Group>
      <Group title={t.srStock}>
        <Card label={t.greenStock} value={n(r.stock.green)} tone="orange" />
        <Card label={t.awwal} value={n(r.stock.awwal)} tone="teal" />
        <Card label={t.doem} value={n(r.stock.doem)} tone="blue" />
        <Card label={t.khangar} value={n(r.stock.khangar)} tone="violet" />
      </Group>
    </div>
  );
}
