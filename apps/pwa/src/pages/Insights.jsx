import { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n.js';
import { get } from '../api.js';
import LineChart from '../components/LineChart.jsx';
import BarChart from '../components/BarChart.jsx';

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

  if (!summary) return <p className="muted" style={{ textAlign: 'center', padding: '2rem' }}>Loading Insights…</p>;
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

  return (
    <div className="grid">
      {/* Timeline Filter Toolbar with 7d, 15d, 30d, 90d, 180d, 365d and Custom Range */}
      <div className="card" style={{ display: 'grid', gap: '0.65rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            📅 {t.insights}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <label htmlFor="insights-range-select" className="visually-hidden">
              {t.insights}
            </label>
            <select
              id="insights-range-select"
              value={range}
              onChange={(e) => {
                const val = e.target.value === 'custom' ? 'custom' : Number(e.target.value);
                setRange(val);
                if (val !== 'custom') {
                  setFromDate(daysAgoStr(val));
                  setToDate(todayStr());
                }
              }}
              style={{
                minHeight: '38px',
                padding: '0.35rem 0.9rem',
                fontSize: '0.92rem',
                fontWeight: 700,
                color: '#0f172a',
                background: '#ffffff',
                border: '1.5px solid #cbd5e1',
                borderRadius: '8px',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                minWidth: '180px',
              }}
            >
              {RANGES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {range === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', paddingTop: '0.5rem', borderTop: '1px solid var(--line-subtle)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 800 }}>{t.fromDate}:</span>
              <input
                type="date"
                value={fromDate}
                max={toDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={{ minHeight: '34px', padding: '0.2rem 0.5rem', fontSize: '0.84rem' }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 800 }}>{t.toDate}:</span>
              <input
                type="date"
                value={toDate}
                min={fromDate}
                max={todayStr()}
                onChange={(e) => setToDate(e.target.value)}
                style={{ minHeight: '34px', padding: '0.2rem 0.5rem', fontSize: '0.84rem' }}
              />
            </label>
            <button
              type="button"
              className="primary"
              style={{ minHeight: '34px', padding: '0.25rem 0.85rem', fontSize: '0.82rem' }}
              onClick={handleApplyCustom}
            >
              {t.save}
            </button>
          </div>
        )}
      </div>

      {/* Info Cards Grouped by Type (Filled with 18-20% opacity matching color, swapped text sizes) */}
      <div className="kpi-section">
        {/* Group 1: Production & Quality Metrics */}
        <div className="kpi-group">
          <h3 className="kpi-group-title">
            🧱 {t.groupProd}
          </h3>
          <div className="kpi-grid">
            <div className="stat" style={{ borderInlineStartColor: 'var(--brand-dark)' }}>
              <span>{t.moulding}</span>
              <strong>{summary.moulded.toLocaleString()}</strong>
            </div>
            <div className="stat" style={{ borderInlineStartColor: summary.wastagePct > 5 ? 'var(--warn-dark)' : 'var(--ok-dark)' }}>
              <span>{t.kharaba}</span>
              <strong className={summary.wastagePct > 5 ? 'warn' : 'ok'}>{summary.wastagePct}%</strong>
            </div>
            <div className="stat" style={{ borderInlineStartColor: summary.awwalSharePct < 85 ? 'var(--warn-dark)' : 'var(--ok-dark)' }}>
              <span>{t.awwal}</span>
              <strong className={summary.awwalSharePct < 85 ? 'warn' : 'ok'}>{summary.awwalSharePct}%</strong>
            </div>
            <div className="stat" style={{ borderInlineStartColor: summary.coalPer1000 > 130 ? 'var(--err-dark)' : 'var(--brand-dark)' }}>
              <span>{t.coalKg}</span>
              <strong>{summary.coalPer1000} kg</strong>
            </div>
          </div>
        </div>

        {/* Group 2: Financial Performance & Cash Flow (No Rs prefix on dashboard) */}
        <div className="kpi-group">
          <h3 className="kpi-group-title">
            💰 {t.groupFinance}
          </h3>
          <div className="kpi-grid">
            <div className="stat" style={{ borderInlineStartColor: 'var(--info)' }}>
              <span>{t.sales}</span>
              <strong>{summary.salesRevenue.toLocaleString()}</strong>
            </div>
            <div className="stat" style={{ borderInlineStartColor: 'var(--ok-dark)' }}>
              <span>{t.totalIn}</span>
              <strong className="ok">{summary.cashReceived.toLocaleString()}</strong>
            </div>
            <div className="stat" style={{ borderInlineStartColor: summary.receivablesOutstanding > 0 ? 'var(--warn-dark)' : 'var(--ok-dark)' }}>
              <span>{t.receivables}</span>
              <strong className={summary.receivablesOutstanding > 0 ? 'warn' : ''}>
                {summary.receivablesOutstanding.toLocaleString()}
              </strong>
            </div>
            <div className="stat" style={{ borderInlineStartColor: 'var(--err-dark)' }}>
              <span>{t.totalOut}</span>
              <strong className="err">{summary.totalExpenses.toLocaleString()}</strong>
            </div>
          </div>
        </div>

        {/* Group 3: Operations & Compliance Monitoring */}
        <div className="kpi-group">
          <h3 className="kpi-group-title">
            ⚖️ {t.groupRisk}
          </h3>
          <div className="kpi-grid">
            <div className="stat" style={{ borderInlineStartColor: 'var(--warn-dark)' }}>
              <span>{t.outstanding}</span>
              <strong>{summary.peshgiOutstanding.toLocaleString()}</strong>
            </div>
            <div className="stat" style={{ borderInlineStartColor: summary.fanOffDays > 0 ? 'var(--err-dark)' : 'var(--ok-dark)' }}>
              <span>{t.fanAlertMsg}</span>
              <strong className={summary.fanOffDays > 0 ? 'err' : 'ok'}>{summary.fanOffDays}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Bonded Labour Alert Table */}
      {bondedRisk.length > 0 && (
        <div className="card">
          <h2>⚠️ {t.bondedLabourRisk}</h2>
          <p role="status" className="warn" style={{ marginBottom: '0.85rem' }}>
            {t.bondedLabourRiskNote}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="rownum">#</th>
                  <th>{t.name}</th>
                  <th style={{ textAlign: 'end' }}>{t.outstanding}</th>
                  <th style={{ textAlign: 'end' }}>{t.daysSinceRecovery}</th>
                </tr>
              </thead>
              <tbody>
                {bondedRisk.map((r, i) => (
                  <tr key={r.workerId}>
                    <td className="rownum">{i + 1}</td>
                    <td><strong>{r.name}</strong></td>
                    <td style={{ textAlign: 'end' }}><strong>{Number(r.outstanding).toLocaleString()}</strong></td>
                    <td style={{ textAlign: 'end' }}>
                      <span className="badge red">{r.daysSinceRecovery === null ? t.never : `${r.daysSinceRecovery} days`}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Production Chart */}
      <div className="card">
        <LineChart
          data={bucketed}
          x="date"
          y="moulded"
          label={t.moulding}
          color="#ea580c"
          format={(v) => Number(v).toLocaleString()}
        />
      </div>

      {/* Quality Awwal Share Chart */}
      <div className="card">
        <LineChart
          data={bucketed}
          x="date"
          y="awwalSharePct"
          label={t.awwal}
          color="#059669"
          format={(v) => `${v}%`}
        />
      </div>

      {/* Fuel Consumption Chart */}
      <div className="card">
        <LineChart
          data={bucketed}
          x="date"
          y="coalPer1000"
          label={t.coalKg}
          color="#dc2626"
          format={(v) => `${v} kg`}
        />
      </div>

      {/* Revenue Timeline */}
      <div className="card">
        <LineChart
          data={bucketed}
          x="date"
          y="revenue"
          label={t.sales}
          color="#0284c7"
          format={(v) => Math.round(v).toLocaleString()}
        />
      </div>

      {/* Unloaded Stock by Grade (Bar Chart) */}
      <div className="card">
        <BarChart
          label={t.firedStock}
          items={[
            { label: t.awwal, value: u.awwal },
            { label: t.doem, value: u.doem },
            { label: t.khangar, value: u.khangar },
            { label: t.broken, value: u.broken },
          ]}
        />
      </div>
    </div>
  );
}


