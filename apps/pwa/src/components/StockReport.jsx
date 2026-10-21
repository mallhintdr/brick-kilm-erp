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

  // three cards: one row of three; four: 2 x 2 on phones; five: 3 + 2 on phones, one row on wide screens
  const Group = ({ title, children }) => {
    const k = [children].flat().filter(Boolean).length;
    const cols = k === 3 ? 'grid-cols-3 sm:grid-cols-3 lg:grid-cols-3' : k === 4 ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-4' : 'grid-cols-3 sm:grid-cols-5 lg:grid-cols-5';
    return (
      <Section title={title}>
        <StatGrid className={cols}>{children}</StatGrid>
      </Section>
    );
  };
  const Card = ({ label, value, tone }) => <StatCard label={label} value={value} tone={tone} className="px-1" compact />;

  return (
    <div className="grid gap-4">
      <Group title={t.srMoulding}>
        <Card label={t.srMoulded} value={n(r.moulding.moulded)} tone="orange" />
        <Card label={t.thisWeek} value={n(r.moulding.week)} tone="amber" />
        <Card label={t.thisMonth} value={n(r.moulding.month)} tone="teal" />
      </Group>
      <Group title={t.kachiBharai}>
        <Card label={t.srLoaded} value={n(r.loading?.total ?? r.kachiBharai)} tone="blue" />
        <Card label={t.thisWeek} value={n(r.loading?.week)} tone="violet" />
        <Card label={t.thisMonth} value={n(r.loading?.month)} tone="teal" />
      </Group>
      <Group title={`${t.srJalai} (${unitWord})`}>
        <Card label={t.fired24h} value={n(r.fired?.day)} tone="red" />
        <Card label={t.fired7d} value={n(r.fired?.week)} tone="orange" />
        <Card label={t.fired30d} value={n(r.fired?.month)} tone="amber" />
      </Group>
      <Group title={t.kilnSituation}>
        <Card label={t.fireAtLine} value={r.situation?.fireAt ? `🔥 ${r.situation.fireAt}` : '—'} tone="red" />
        <Card label={t.empty} value={n(r.situation?.empty)} tone="slate" />
        <Card label={t.readyToUnload} value={n(r.situation?.ready)} tone="teal" />
        <Card label={t.cooling} value={n(r.situation?.cooling)} tone="violet" />
        <Card label={t.preheating} value={n(r.situation?.preheating)} tone="amber" />
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
        <Card label={t.greenInField} value={n(r.stock.green)} tone="orange" />
        <Card label={t.greenInKiln} value={n(r.stock.greenInKiln ?? r.inKiln?.green)} tone="amber" />
        <Card label={t.awwal} value={n(r.stock.awwal)} tone="teal" />
        <Card label={t.doem} value={n(r.stock.doem)} tone="blue" />
        <Card label={t.khangar} value={n(r.stock.khangar)} tone="violet" />
      </Group>
    </div>
  );
}
