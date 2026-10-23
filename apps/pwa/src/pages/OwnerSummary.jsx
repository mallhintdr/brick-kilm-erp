import { useEffect, useState } from 'react';
import { Share2 } from 'lucide-react';
import { useT } from '../i18n.js';
import { get, fmtDate } from '../api.js';
import { Card, CardHeader, CardBody, Section, StatGrid, StatCard, Button, SkeletonCards, tbl, cx } from '../components/ui.jsx';

const n = (v) => Math.round(Number(v || 0)).toLocaleString();

// Owner Summary: cash needed this Thursday, jamadar groups, what we owe parties, cost per 1,000 bricks.
export default function OwnerSummary() {
  const t = useT();
  const [d, setD] = useState(null);
  const [day, setDay] = useState(null);
  useEffect(() => {
    get('/owner-summary').then(setD).catch(() => setD(null));
    get(`/day?date=${new Date().toISOString().slice(0, 10)}`).then(setDay).catch(() => {});
  }, []);
  if (!d) return <SkeletonCards n={4} />;
  const owe = d.payables.filter((p) => p.balance > 0);
  const moulded = day ? day.moulding.reduce((a, r) => a + r.count, 0) : 0;
  const sold = day ? day.sales.reduce((a, r) => a + r.qty, 0) : 0;
  const text = [
    `${t.appName} — ${fmtDate(new Date())}`,
    `${t.mouldedToday}: ${n(moulded)}`, `${t.firing}: ${day?.firing.length || 0}`, `${t.sales}: ${n(sold)}`,
    `${t.thursdayCash}: ${n(d.payroll.cash)}`, `${t.weOwe}: ${n(owe.reduce((a, p) => a + p.balance, 0))}`,
    `${t.costPer1000}: ${n(d.cost30.per1000)}`,
  ].join('\n');
  const Table = ({ head, rows }) => (
    <div className="table-wrap stack-wrap overflow-x-auto rounded-lg ring-1 ring-n-200">
      <table className={tbl.table}>
        <thead><tr>{head.map((h) => <th key={h} className={tbl.th}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className={tbl.tr}>{r.map((c, j) => <td key={j} className={cx(tbl.td, j === 0 && 'text-start font-semibold')}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title={t.ownerSummary}>
          <Button size="sm" variant="secondary" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')}><Share2 className="size-4" /> WhatsApp</Button>
        </CardHeader>
        <CardBody className="gap-4">
          <Section title={t.thursdayCash}>
            <StatGrid>
              <StatCard label={t.earnedThisWeek} value={n(d.payroll.earned)} tone="blue" />
              <StatCard label={t.dailyKharcha} value={n(d.payroll.dasti)} tone="amber" />
              <StatCard label={t.thursdayCash} value={n(d.payroll.cash)} tone="green" />
            </StatGrid>
            <p className="m-0 text-center text-xs text-n-500">{t.weekFrom} {fmtDate(d.weekStart)} · {t.beforeCut}</p>
            {d.payroll.rows.length > 0 && <Table head={[t.name, t.earnedThisWeek, t.dailyKharcha, t.thursdayCash]} rows={d.payroll.rows.slice(0, 40).map((r) => [r.name, n(r.earned), n(r.dasti), n(r.cash)])} />}
          </Section>
          <Section title={t.costPer1000}>
            <StatGrid>
              <StatCard label={`${t.costPer1000} (30 Days)`} value={n(d.cost30.per1000)} tone="orange" />
              <StatCard label={t.labourCost} value={n(d.cost30.labour)} tone="violet" />
              <StatCard label={t.otherCost} value={n(d.cost30.expenses)} tone="pink" />
              <StatCard label={t.bricksUnloaded} value={n(d.cost30.bricks)} tone="teal" />
            </StatGrid>
          </Section>
          <Section title={t.weOwe}>
            {owe.length ? <Table head={[t.name, t.balance, t.lastEntry]} rows={owe.map((p) => [p.party, n(p.balance), p.last ? fmtDate(p.last) : '—'])} /> : <p className="m-0 text-center text-sm text-n-500">{t.noEntries}</p>}
          </Section>
          <Section title={t.jamadarGroups}>
            <Table head={[t.referenceJamadar, t.workers, t.peshgiBal]} rows={d.jamadars.map((g) => [g.jamadar, g.workers, n(g.peshgi)])} />
          </Section>
          {d.leftOwing.length > 0 && (
            <Section title={t.leftOwing}>
              <Table head={[t.name, t.peshgiBal]} rows={d.leftOwing.map((w) => [w.name, n(w.peshgi)])} />
            </Section>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
