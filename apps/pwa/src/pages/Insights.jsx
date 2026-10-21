import { useEffect, useMemo, useState } from 'react';
import StockReport from '../components/StockReport.jsx';
import { useT } from '../i18n.js';
import { get } from '../api.js';
import LineChart from '../components/LineChart.jsx';
import BarChart from '../components/BarChart.jsx';
import { SkeletonCards, Card, CardBody, Field, Input, Select, Button, Section, StatGrid, StatCard, Muted, Badge, TableCard, tbl, cx } from '../components/ui.jsx';

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

function rollup(daily, bucketDays) {
  if (bucketDays <= 1) return daily;
  const out = [];
  for (let i = 0; i < daily.length; i += bucketDays) {
    const chunk = daily.slice(i, i + bucketDays);
    const sum = (k) => chunk.reduce((a, d) => a + (d[k] || 0), 0);
    const totalGraded = sum('awwal') + sum('doem') + sum('khangar') + sum('broken');
    out.push({
      date: chunk[0].date,
      moulded: sum('moulded'),
      coalKg: sum('coalKg'),
      revenue: sum('revenue'),
      cashIn: sum('cashIn'),
      cashOut: sum('cashOut'),
      awwalSharePct: totalGraded ? +((sum('awwal') / totalGraded) * 100).toFixed(1) : 0,
      coalPer1000: totalGraded ? +((sum('coalKg') / totalGraded) * 1000).toFixed(1) : 0,
    });
  }
  return out;
}

export default function Insights() {
  const t = useT();
  const [range, setRange] = useState(180);
  const [fromDate, setFromDate] = useState(daysAgoStr(180));
  const [toDate, setToDate] = useState(todayStr());
  const [summary, setSummary] = useState(null);
  const [daily, setDaily] = useState([]);
  const [bondedRisk, setBondedRisk] = useState([]);

  useEffect(() => {
    get('/insights/summary').then(setSummary).catch(() => {});
    get('/insights/bonded-labour-risk').then(setBondedRisk).catch(() => {});
  }, []);

  const fetchDaily = (rangeKey, fDate, tDate) => {
    const url = rangeKey === 'custom'
      ? `/insights/daily?from=${fDate}&to=${tDate}`
      : `/insights/daily?days=${rangeKey}`;
    get(url).then(setDaily).catch(() => setDaily([]));
  };

  useEffect(() => {
    fetchDaily(range, fromDate, toDate);
  }, [range]);

  const handleApplyCustom = () => {
    fetchDaily('custom', fromDate, toDate);
  };

  const dayCount = range === 'custom'
    ? Math.max(1, Math.round((new Date(toDate) - new Date(fromDate)) / 86400000))
    : Number(range) || 30;

  const bucketed = useMemo(() => rollup(daily, dayCount > 90 ? 7 : dayCount > 30 ? 3 : 1), [daily, dayCount]);

  if (!summary) return <SkeletonCards n={4} />;
  const u = summary.unloaded;

  const RANGES = [
    { key: 7, label: t.days7 },
    { key: 15, label: t.days15 },
    { key: 30, label: t.days30 },
    { key: 90, label: t.days90 },
    { key: 180, label: t.days180 },
    { key: 365, label: t.days365 },
    { key: 'custom', label: t.customRange },
  ];

  const chart = (y, label, color, format) => (
    <Card className="p-3"><LineChart data={bucketed} x="date" y={y} label={label} color={color} format={format} /></Card>
  );

  return (
    <div className="grid gap-4">
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-lg font-bold text-n-900">{t.insights}</h2>
            <Select
              aria-label={t.insights} value={range} className="min-h-10 max-w-56"
              onChange={(e) => {
                const val = e.target.value === 'custom' ? 'custom' : Number(e.target.value);
                setRange(val);
                if (val !== 'custom') { setFromDate(daysAgoStr(val)); setToDate(todayStr()); }
              }}
            >
              {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </Select>
          </div>
          {range === 'custom' && (
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
              <Field label={t.fromDate}><Input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} className="min-h-10" /></Field>
              <Field label={t.toDate}><Input type="date" value={toDate} min={fromDate} max={todayStr()} onChange={(e) => setToDate(e.target.value)} className="min-h-10" /></Field>
              <Button size="sm" className="min-h-10" onClick={handleApplyCustom}>{t.save}</Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="p-4"><StockReport /></Card>

      <Card className="grid gap-4 p-4">
        <Section title={t.groupProd}>
          <StatGrid className="sm:grid-cols-3 lg:grid-cols-3">
            <StatCard label={t.moulding} value={summary.moulded.toLocaleString()} tone="orange" />
            <StatCard label={t.awwal} value={`${summary.awwalSharePct}%`} tone={summary.awwalSharePct < 85 ? 'amber' : 'green'} />
            <StatCard label={t.coalKg} value={`${summary.coalPer1000} kg`} tone={summary.coalPer1000 > 130 ? 'red' : 'slate'} className="col-span-2 sm:col-span-1" />
          </StatGrid>
        </Section>
        <Section title={t.groupFinance}>
          <StatGrid className="sm:grid-cols-4 lg:grid-cols-4">
            <StatCard label={t.sales} value={summary.salesRevenue.toLocaleString()} tone="blue" />
            <StatCard label={t.totalIn} value={summary.cashReceived.toLocaleString()} tone="green" />
            <StatCard label={t.receivables} value={summary.receivablesOutstanding.toLocaleString()} tone={summary.receivablesOutstanding > 0 ? 'amber' : 'green'} />
            <StatCard label={t.totalOut} value={summary.totalExpenses.toLocaleString()} tone="red" />
          </StatGrid>
        </Section>
        <Section title={t.groupRisk}>
          <StatGrid className="grid-cols-1 sm:grid-cols-1 lg:grid-cols-1">
            <StatCard label={t.outstanding} value={summary.peshgiOutstanding.toLocaleString()} tone="amber" />
          </StatGrid>
        </Section>
      </Card>

      {bondedRisk.length > 0 && (
        <TableCard title={t.bondedLabourRisk}>
          <p className="m-0 bg-amber-50 px-4 py-2 text-sm text-amber-800">{t.bondedLabourRiskNote}</p>
          <table className={tbl.table}>
            <thead>
              <tr>
                <th className={cx('rownum', tbl.th)}>#</th><th className={cx('sticky-col', tbl.th)}>{t.name}</th>
                <th className={tbl.th}>{t.outstanding}</th><th className={tbl.th}>{t.daysSinceRecovery}</th>
              </tr>
            </thead>
            <tbody>
              {bondedRisk.map((r, i) => (
                <tr key={r.workerId} className={tbl.tr}>
                  <td className={cx('rownum', tbl.td, 'text-n-500')}>{i + 1}</td>
                  <td className={cx(tbl.td, 'font-semibold')}>{r.name}</td>
                  <td className={cx(tbl.td, 'text-end font-bold')}>{Number(r.outstanding).toLocaleString()}</td>
                  <td className={tbl.td}><Badge tone="err">{r.daysSinceRecovery === null ? t.never : `${r.daysSinceRecovery} days`}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {/* charts: one per row on phones, two per row on wide screens */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {chart('moulded', t.moulding, '#ea580c', (v) => Number(v).toLocaleString())}
        {chart('awwalSharePct', t.awwal, '#059669', (v) => `${v}%`)}
        {chart('coalPer1000', t.coalKg, '#dc2626', (v) => `${v} kg`)}
        {chart('revenue', t.sales, '#0284c7', (v) => Math.round(v).toLocaleString())}
        <Card className="p-3 xl:col-span-2">
          <BarChart
            label={t.firedStock}
            items={[
              { label: t.awwal, value: u.awwal },
              { label: t.doem, value: u.doem },
              { label: t.khangar, value: u.khangar },
              { label: t.broken, value: u.broken },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
