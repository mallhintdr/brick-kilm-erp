import { useEffect, useMemo, useState } from 'react';
import { useT, useLang } from '../i18n.js';
import { get, fmtDate, fmtDateDM } from '../api.js';
import DateTime from '../components/DateTime.jsx';

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const REPORT_MODULES = [
  { id: 'moulding', labelKey: 'moulding', en: 'Moulding (Pathai)', ur: 'کچی اینٹ (پتھائی)', color: '#d97706' },
  { id: 'bharai', labelKey: 'kachiBharai', en: 'Kachi Bharai (Loading)', ur: 'کچی بھرائی', color: '#2563eb' },
  { id: 'nikasi', labelKey: 'unloadingNikasi', en: 'Nikasi (Awwal, Doem, Khangar)', ur: 'نکاسی (اول، دوم، کھنگر)', color: '#16a34a' },
  { id: 'stock', labelKey: 'remainingStock', en: 'Remaining Stock', ur: 'باقی ذخیرہ', color: '#7c3aed' },
  { id: 'firing', labelKey: 'firing', en: 'Firing & Kiln Shifts', ur: 'پکائی و شفٹیں', color: '#ef4444' },
  { id: 'coal', labelKey: 'coalConsumption', en: 'Coal Consumption', ur: 'کوئلہ کھپت', color: '#334155' },
  { id: 'sales', labelKey: 'sales', en: 'Brick Sales & Dispatch', ur: 'اینٹ فروخت و نکاسی', color: '#f43f5e' },
  { id: 'peshgi', labelKey: 'peshgi', en: 'Peshgi Advances', ur: 'پیشگی ایڈوانس', color: '#10b981' },
  { id: 'kharchi', labelKey: 'kharchiRun', en: 'Kharchi & Wages', ur: 'خرچی و اجرت', color: '#6366f1' },
  { id: 'grn', labelKey: 'purchases', en: 'Purchases (GRN)', ur: 'خریداری (کوئلہ/مٹی)', color: '#0284c7' },
  { id: 'cashbook', labelKey: 'cashbook', en: 'Cash Book Transactions', ur: 'روزنامچہ کیش بک', color: '#059669' },
];

export default function Reports() {
  const t = useT();
  const { lang } = useLang();

  // Period ranges: Weekly (7d), 15 days, 30 days, 90 days, 180 days, 365 days, and Custom Range
  const [range, setRange] = useState(30);
  const [fromDate, setFromDate] = useState(daysAgoStr(30));
  const [toDate, setToDate] = useState(todayStr());

  // Checkbox selection for modules
  const [selectedModules, setSelectedModules] = useState({
    moulding: true,
    bharai: true,
    nikasi: true,
    stock: true,
    firing: true,
    coal: true,
    sales: true,
    peshgi: true,
    kharchi: true,
    grn: true,
    cashbook: true,
  });

  // Data collections
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({
    moulding: [],
    firing: [],
    sales: [],
    peshgi: [],
    kharchi: [],
    grn: [],
    cashbook: [],
  });

  // Table column filters per module
  const [filters, setFilters] = useState({
    moulding: {},
    firing: {},
    sales: {},
    peshgi: {},
    kharchi: {},
    grn: {},
    cashbook: {},
  });

  const updateFilter = (mod, field, val) => {
    setFilters((prev) => ({
      ...prev,
      [mod]: { ...prev[mod], [field]: val },
    }));
  };

  const clearFilter = (mod) => {
    setFilters((prev) => ({ ...prev, [mod]: {} }));
  };

  const RANGES = [
    { key: 7, label: lang === 'ur' ? '7 دن (ہفتہ وار)' : 'Weekly (7 Days)' },
    { key: 15, label: lang === 'ur' ? '15 دن' : '15 Days' },
    { key: 30, label: lang === 'ur' ? '30 دن' : '30 Days' },
    { key: 90, label: lang === 'ur' ? '90 دن (سہ ماہی)' : '90 Days' },
    { key: 180, label: lang === 'ur' ? '180 دن (چھ ماہی)' : '180 Days' },
    { key: 365, label: lang === 'ur' ? '365 دن (سالانہ)' : '365 Days' },
    { key: 'custom', label: lang === 'ur' ? 'اپنی مرضی کی تاریخیں' : 'Custom Range' },
  ];

  // Fetch report data
  const generateReport = async () => {
    setLoading(true);
    try {
      const [mouldingRes, firingRes, salesRes, peshgiRes, kharchiRes, grnRes, cashRes, loadsRes, unloadRes, stockRes] = await Promise.all([
        get('/moulding').catch(() => []),
        get('/firing-logs').catch(() => []),
        get('/invoices').catch(() => []),
        get('/advances').catch(() => []),
        get('/kharchi/runs').catch(() => []),
        get('/grns').catch(() => []),
        get('/cashbook/transactions').catch(() => []),
        get('/section-loads').catch(() => []),
        get('/unloadings').catch(() => []),
        get('/inventory/summary').catch(() => null),
      ]);

      const fStart = new Date(`${fromDate}T00:00:00`).getTime();
      const fEnd = new Date(`${toDate}T23:59:59`).getTime();

      const inRange = (item) => {
        const d = item.date || item.createdAt || item.timestamp;
        if (!d) return true;
        const time = new Date(d).getTime();
        return time >= fStart && time <= fEnd;
      };

      setData({
        moulding: (mouldingRes || []).filter(inRange),
        firing: (firingRes || []).filter(inRange),
        sales: (salesRes || []).filter(inRange),
        peshgi: (peshgiRes || []).filter(inRange),
        kharchi: (kharchiRes || []).filter(inRange),
        grn: (grnRes || []).filter(inRange),
        cashbook: (cashRes || []).filter(inRange),
        bharai: (loadsRes || []).filter(inRange),
        nikasi: (unloadRes || []).filter(inRange),
        stock: stockRes,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateReport();
  }, [range, fromDate, toDate]);

  const toggleModule = (id) => {
    setSelectedModules((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectAll = (val) => {
    const next = {};
    REPORT_MODULES.forEach((m) => { next[m.id] = val; });
    setSelectedModules(next);
  };

  // KPI Calculations
  const stats = useMemo(() => {
    const m = data.moulding;
    const f = data.firing;
    const s = data.sales;
    const p = data.peshgi;
    const k = data.kharchi;
    const g = data.grn;
    const c = data.cashbook;

    const totalMoulded = m.reduce((acc, row) => acc + (Number(row.count) || 0), 0);
    const totalNetMoulded = m.reduce((acc, row) => acc + (Number(row.netCount) || 0), 0);
    const totalKharaba = m.reduce((acc, row) => acc + (Number(row.kharaba) || 0), 0);
    const wastageRate = totalMoulded > 0 ? ((totalKharaba / totalMoulded) * 100).toFixed(1) : 0;

    const totalCoalKg = f.reduce((acc, row) => acc + (Number(row.coalKg) || 0), 0);
    const totalShifts = f.length;

    const totalSalesRev = s.reduce((acc, row) => acc + (Number(row.totalRs || row.amount) || 0), 0);
    const totalBricksSold = s.reduce((acc, row) => acc + (Number(row.qty) || 0), 0);

    const totalPeshgi = p.reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
    const totalKharchi = k.reduce((acc, row) => acc + (Number(row.totalPaid || row.amount) || 0), 0);
    const totalPurchases = g.reduce((acc, row) => acc + (Number(row.landedTotal || row.amount) || 0), 0);

    const cashIn = c.filter((x) => x.type === 'in' || x.type === 'deposit').reduce((acc, x) => acc + (Number(x.amount) || 0), 0);
    const cashOut = c.filter((x) => x.type === 'out' || x.type === 'expense').reduce((acc, x) => acc + (Number(x.amount) || 0), 0);

    return {
      totalMoulded,
      totalNetMoulded,
      totalKharaba,
      wastageRate,
      totalCoalKg,
      totalShifts,
      totalSalesRev,
      totalBricksSold,
      totalPeshgi,
      totalKharchi,
      totalPurchases,
      cashIn,
      cashOut,
      cashNet: cashIn - cashOut,
    };
  }, [data]);

  // Client-side quick filtering helpers
  const filterList = (list, modFilters) => {
    return list.filter((item) => {
      for (const [key, searchStr] of Object.entries(modFilters)) {
        if (!searchStr) continue;
        const q = String(searchStr).trim().toLowerCase();
        if (!q) continue;
        const val = String(item[key] ?? '').toLowerCase();
        if (!val.includes(q)) return false;
      }
      return true;
    });
  };

  const filteredMoulding = useMemo(() => filterList(data.moulding, filters.moulding), [data.moulding, filters.moulding]);
  const filteredFiring = useMemo(() => filterList(data.firing, filters.firing), [data.firing, filters.firing]);
  const filteredSales = useMemo(() => filterList(data.sales, filters.sales), [data.sales, filters.sales]);
  const filteredPeshgi = useMemo(() => filterList(data.peshgi, filters.peshgi), [data.peshgi, filters.peshgi]);
  const filteredKharchi = useMemo(() => filterList(data.kharchi, filters.kharchi), [data.kharchi, filters.kharchi]);
  const filteredGrn = useMemo(() => filterList(data.grn, filters.grn), [data.grn, filters.grn]);
  const filteredCashbook = useMemo(() => filterList(data.cashbook, filters.cashbook), [data.cashbook, filters.cashbook]);


  return (
    <div className="grid" style={{ gap: '1.25rem' }}>
      {/* Configuration Card: Range Buttons & Checkboxes */}
      <div className="card no-print" style={{ display: 'grid', gap: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ margin: 0, border: 'none', padding: 0 }}>
            {lang === 'ur' ? 'جامع کاروباری رپورٹ جنریٹر' : 'Comprehensive Kiln Operations Reports'}
          </h2>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className="primary"
              onClick={() => window.print()}
              style={{
                minHeight: '32px',
                padding: '0.2rem 0.65rem',
                fontSize: '0.78rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontWeight: 700,
              }}
              title={lang === 'ur' ? 'پرنٹ / پی ڈی ایف' : 'Print / Export PDF'}
            >
              <span style={{ fontSize: '1.45rem', lineHeight: 1, display: 'inline-block' }}>🖨️</span>
              <span>{lang === 'ur' ? 'پرنٹ / پی ڈی ایف' : 'Print / Export PDF'}</span>
            </button>
            <button
              type="button"
              className="ghost"
              onClick={generateReport}
              disabled={loading}
              style={{
                minHeight: '32px',
                padding: '0.2rem 0.65rem',
                fontSize: '0.78rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontWeight: 700,
              }}
              title={lang === 'ur' ? 'ریفریش' : 'Refresh'}
            >
              <span style={{ fontSize: '1.45rem', lineHeight: 1, display: 'inline-block' }}>🔄</span>
              <span>{loading ? '...' : (lang === 'ur' ? 'ریفریش' : 'Refresh')}</span>
            </button>
          </div>
        </div>

        {/* Timeframe Dropdown Selector matching Insights page */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.65rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--ink)' }}>
              📅 {lang === 'ur' ? 'رپورٹ کی مدت:' : 'Report Timeframe:'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <label htmlFor="report-range-select" className="visually-hidden">
              {lang === 'ur' ? 'رپورٹ کی مدت' : 'Report Timeframe'}
            </label>
            <select
              id="report-range-select"
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
                minWidth: '200px',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', paddingTop: '0.4rem', borderTop: '1px solid var(--line-subtle)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 800 }}>{t.fromDate}:</span>
              <input
                type="date"
                value={fromDate}
                max={toDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={{ minHeight: '32px', padding: '0.15rem 0.5rem', fontSize: '0.82rem' }}
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
                style={{ minHeight: '32px', padding: '0.15rem 0.5rem', fontSize: '0.82rem' }}
              />
            </label>
            <button type="button" className="primary" onClick={generateReport} style={{ minHeight: '32px', padding: '0.2rem 0.75rem', fontSize: '0.82rem' }}>
              {t.save}
            </button>
          </div>
        )}

        {/* Item Selection Checkboxes */}
        <div style={{ paddingTop: '0.4rem', borderTop: '1px solid var(--line-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--ink)' }}>
              ☑ {lang === 'ur' ? 'رپورٹ میں شامل کرنے کے لیے آئٹمز منتخب کریں:' : 'Include Items in Report:'}
            </span>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button type="button" className="ghost" onClick={() => selectAll(true)} style={{ minHeight: '26px', padding: '0.1rem 0.5rem', fontSize: '0.74rem' }}>
                {lang === 'ur' ? 'تمام منتخب کریں' : 'Select All'}
              </button>
              <button type="button" className="ghost" onClick={() => selectAll(false)} style={{ minHeight: '26px', padding: '0.1rem 0.5rem', fontSize: '0.74rem' }}>
                {lang === 'ur' ? 'غیر منتخب کریں' : 'Deselect All'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem' }}>
            {REPORT_MODULES.map((m) => (
              <label
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.35rem 0.65rem',
                  borderRadius: '7px',
                  background: selectedModules[m.id] ? 'rgba(234, 88, 12, 0.08)' : '#f8fafc',
                  border: `1.5px solid ${selectedModules[m.id] ? m.color : 'var(--line)'}`,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={!!selectedModules[m.id]}
                  onChange={() => toggleModule(m.id)}
                  style={{ accentColor: m.color }}
                />
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--ink)' }}>
                  {lang === 'ur' ? m.ur : m.en}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Printable Report Header: title, then From / To in one outlined row */}
      <div className="card slip-header-box report-head">
        <h1>{lang === 'ur' ? 'جامع آپریشنل رپورٹ' : 'Executive Operations Report'}</h1>
        <div className="report-range">
          <span>{t.fromDate}</span><strong>{fmtDate(fromDate)}</strong>
          <span>{t.toDate}</span><strong>{fmtDate(toDate)}</strong>
        </div>
      </div>

      {/* Summary KPI Cards (10% Opacity Fill matching specification) */}
      <div className="kpi-section">
        <div className="kpi-group">
          <h3 className="kpi-group-title">
            {lang === 'ur' ? 'مدت کا مجموعی خلاصہ (10٪ شفافیت پر)' : 'Period Executive Summary'}
          </h3>
          <div className="kpi-grid">
            {selectedModules.moulding && (
              <div className="stat">
                <span>{lang === 'ur' ? 'کل کچی پتھائی' : 'Total Moulded'}</span>
                <strong>{stats.totalMoulded.toLocaleString()}</strong>
              </div>
            )}
            {selectedModules.moulding && (
              <div className="stat" style={{ borderInlineStartColor: stats.wastageRate > 5 ? 'var(--warn-dark)' : 'var(--ok-dark)' }}>
                <span>{lang === 'ur' ? 'خرابہ کی شرح' : 'Kharaba %'}</span>
                <strong className={stats.wastageRate > 5 ? 'warn' : 'ok'}>{stats.wastageRate}%</strong>
              </div>
            )}
            {selectedModules.firing && (
              <div className="stat">
                <span>{lang === 'ur' ? 'پکائی شفٹیں' : 'Firing Shifts'}</span>
                <strong>{stats.totalShifts}</strong>
              </div>
            )}
            {selectedModules.coal && (
              <div className="stat">
                <span>{lang === 'ur' ? 'کوئلہ کھپت' : 'Coal Burned'}</span>
                <strong>{stats.totalCoalKg.toLocaleString()} kg</strong>
              </div>
            )}
            {/* Kachi bharai, nikasi and remaining stock */}
      {selectedModules.bharai && (
        <div className="card table-wrap">
          <h2>{lang === 'ur' ? 'کچی بھرائی' : 'Kachi Bharai (Loading)'} — {(data.bharai || []).reduce((a, r) => a + (r.count || 0), 0).toLocaleString()}</h2>
          <table>
            <thead><tr><th className="rownum">#</th><th className="sticky-col">{lang === 'ur' ? 'تاریخ' : 'Date'}</th><th>{lang === 'ur' ? 'لائن / چیمبر' : 'Line / chamber'}</th><th>{lang === 'ur' ? 'اینٹیں' : 'Bricks'}</th></tr></thead>
            <tbody>
              {(data.bharai || []).map((r, i) => (
                <tr key={r._id}><td className="rownum">{i + 1}</td><td><DateTime value={r.date} /></td><td>{r.unit === 'line' ? 'Line' : 'Chamber'} {r.sectionIndex}</td><td><strong>{(r.count || 0).toLocaleString()}</strong></td></tr>
              ))}
              {!(data.bharai || []).length && <tr><td colSpan={4} className="muted">{t.noEntries}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {selectedModules.nikasi && (() => {
        const rows = data.nikasi || [];
        const sum = (k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
        return (
          <div className="card table-wrap">
            <h2>{lang === 'ur' ? 'نکاسی' : 'Nikasi (Unloading)'}</h2>
            <div className="kpi-grid" style={{ padding: '0.5rem 0.75rem' }}>
              <div className="stat" style={{ borderInlineStartColor: 'var(--ok-dark)' }}><span>{t.awwal}</span><strong className="ok">{sum('awwal').toLocaleString()}</strong></div>
              <div className="stat" style={{ borderInlineStartColor: 'var(--info)' }}><span>{t.doem}</span><strong>{sum('doem').toLocaleString()}</strong></div>
              <div className="stat" style={{ borderInlineStartColor: 'var(--warn-dark)' }}><span>{t.khangar}</span><strong className="warn">{sum('khangar').toLocaleString()}</strong></div>
              <div className="stat" style={{ borderInlineStartColor: 'var(--err-dark)' }}><span>{t.broken}</span><strong className="err">{sum('broken').toLocaleString()}</strong></div>
            </div>
            <table>
              <thead><tr><th className="rownum">#</th><th className="sticky-col">{lang === 'ur' ? 'تاریخ' : 'Date'}</th><th>{lang === 'ur' ? 'لائن / چیمبر' : 'Line / chamber'}</th><th>{t.awwal}</th><th>{t.doem}</th><th>{t.khangar}</th><th>{t.broken}</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r._id}><td className="rownum">{i + 1}</td><td><DateTime value={r.date} /></td><td>{r.unit === 'line' ? 'Line' : 'Chamber'} {r.sectionIndex}</td><td>{(r.awwal || 0).toLocaleString()}</td><td>{(r.doem || 0).toLocaleString()}</td><td>{(r.khangar || 0).toLocaleString()}</td><td>{(r.broken || 0).toLocaleString()}</td></tr>
                ))}
                {!rows.length && <tr><td colSpan={7} className="muted">{t.noEntries}</td></tr>}
              </tbody>
            </table>
          </div>
        );
      })()}

      {selectedModules.stock && data.stock && (
        <div className="kpi-section">
          <div className="kpi-group">
            <h3 className="kpi-group-title">{lang === 'ur' ? 'باقی ذخیرہ (آج تک)' : 'Remaining Stock (as of today)'}</h3>
            <div className="kpi-grid">
              <div className="stat" style={{ borderInlineStartColor: 'var(--brand-dark)' }}><span>{t.greenStock}</span><strong>{(data.stock.greenStock || 0).toLocaleString()}</strong></div>
              <div className="stat" style={{ borderInlineStartColor: 'var(--ok-dark)' }}><span>{t.awwal}</span><strong className="ok">{(data.stock.firedStockByGrade?.awwal || 0).toLocaleString()}</strong></div>
              <div className="stat" style={{ borderInlineStartColor: 'var(--info)' }}><span>{t.doem}</span><strong>{(data.stock.firedStockByGrade?.doem || 0).toLocaleString()}</strong></div>
              <div className="stat" style={{ borderInlineStartColor: 'var(--warn-dark)' }}><span>{t.khangar}</span><strong className="warn">{(data.stock.firedStockByGrade?.khangar || 0).toLocaleString()}</strong></div>
            </div>
          </div>
        </div>
      )}

      {selectedModules.sales && (
              <div className="stat">
                <span>{lang === 'ur' ? 'کل فروخت آمدن' : 'Sales Revenue'}</span>
                <strong className="ok">{stats.totalSalesRev.toLocaleString()}</strong>
              </div>
            )}
            {selectedModules.peshgi && (
              <div className="stat">
                <span>{lang === 'ur' ? 'پیشگی جاری کردہ' : 'Peshgi Issued'}</span>
                <strong>{stats.totalPeshgi.toLocaleString()}</strong>
              </div>
            )}
            {selectedModules.kharchi && (
              <div className="stat">
                <span>{lang === 'ur' ? 'خرچی و اجرت' : 'Kharchi Distributed'}</span>
                <strong>{stats.totalKharchi.toLocaleString()}</strong>
              </div>
            )}
            {selectedModules.grn && (
              <div className="stat">
                <span>{lang === 'ur' ? 'خریداری خرچ' : 'Purchases (GRN)'}</span>
                <strong>{stats.totalPurchases.toLocaleString()}</strong>
              </div>
            )}
            {selectedModules.cashbook && (
              <div className="stat" style={{ borderInlineStartColor: stats.cashNet >= 0 ? 'var(--ok-dark)' : 'var(--err-dark)' }}>
                <span>{lang === 'ur' ? 'خالص کیش فلو' : 'Net Cash Flow'}</span>
                <strong className={stats.cashNet >= 0 ? 'ok' : 'err'}>{stats.cashNet.toLocaleString()}</strong>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODULE 1: MOULDING TABLE */}
      {selectedModules.moulding && (
        <div className="card table-wrap">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem' }}>
            <h2 style={{ margin: 0, border: 'none', padding: 0 }}>
              {lang === 'ur' ? 'کچی اینٹ (پتھائی) کا ریکارڈ' : 'Moulding Production Records'} ({filteredMoulding.length})
            </h2>
            {Object.values(filters.moulding).some(Boolean) && (
              <button type="button" className="clear-filter-btn" onClick={() => clearFilter('moulding')}>
                ✕ {lang === 'ur' ? 'فلٹر صاف کریں' : 'Clear Filters'}
              </button>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th className="rownum">#</th>
                <th>{t.date}</th>
                <th className="sticky-col">{t.team}</th>
                <th>{lang === 'ur' ? 'کل کچی' : 'Gross Bricks'}</th>
                <th>{t.kharaba}</th>
                <th>{lang === 'ur' ? 'خالص کچی' : 'Net Bricks'}</th>
                <th>{t.status}</th>
              </tr>
              <tr className="filter-row no-print">
                <th className="rownum" />
                <th>
                  <input
                    type="search"
                    className="table-col-filter"
                    value={filters.moulding.date || ''}
                    onChange={(e) => updateFilter('moulding', 'date', e.target.value)}
                  />
                </th>
                <th>
                  <input
                    type="search"
                    className="table-col-filter"
                    value={filters.moulding.teamId || ''}
                    onChange={(e) => updateFilter('moulding', 'teamId', e.target.value)}
                  />
                </th>
                <th>
                  <input
                    type="search"
                    className="table-col-filter"
                    value={filters.moulding.count || ''}
                    onChange={(e) => updateFilter('moulding', 'count', e.target.value)}
                  />
                </th>
                <th>
                  <input
                    type="search"
                    className="table-col-filter"
                    value={filters.moulding.kharaba || ''}
                    onChange={(e) => updateFilter('moulding', 'kharaba', e.target.value)}
                  />
                </th>
                <th>
                  <input
                    type="search"
                    className="table-col-filter"
                    value={filters.moulding.netCount || ''}
                    onChange={(e) => updateFilter('moulding', 'netCount', e.target.value)}
                  />
                </th>
                <th>
                  <input
                    type="search"
                    className="table-col-filter"
                    value={filters.moulding.status || ''}
                    onChange={(e) => updateFilter('moulding', 'status', e.target.value)}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredMoulding.length === 0 ? (
                <tr><td colSpan="7" style={{ padding: '1.5rem', color: 'var(--muted)' }}>No records matching period</td></tr>
              ) : (
                filteredMoulding.map((row, i) => (
                  <tr key={row._id || i}>
                    <td className="rownum">{i + 1}</td>
                    <td>{fmtDate(row.date)}</td>
                    <td>{row.teamName || row.teamId || '-'}</td>
                    <td><strong>{Number(row.count).toLocaleString()}</strong></td>
                    <td className={row.kharaba > 0 ? 'warn' : ''}>{Number(row.kharaba).toLocaleString()}</td>
                    <td><strong className="ok">{Number(row.netCount).toLocaleString()}</strong></td>
                    <td><span className="badge green">{row.status || 'Drying'}</span></td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="3">Total</td>
                <td>{filteredMoulding.reduce((a, b) => a + (Number(b.count) || 0), 0).toLocaleString()}</td>
                <td>{filteredMoulding.reduce((a, b) => a + (Number(b.kharaba) || 0), 0).toLocaleString()}</td>
                <td>{filteredMoulding.reduce((a, b) => a + (Number(b.netCount) || 0), 0).toLocaleString()}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* MODULE 2: FIRING & COAL TABLE */}
      {(selectedModules.firing || selectedModules.coal) && (
        <div className="card table-wrap">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem' }}>
            <h2 style={{ margin: 0, border: 'none', padding: 0 }}>
              {lang === 'ur' ? 'پکائی و کوئلہ کھپت' : 'Firing Shifts & Coal Consumption'} ({filteredFiring.length})
            </h2>
            {Object.values(filters.firing).some(Boolean) && (
              <button type="button" className="clear-filter-btn" onClick={() => clearFilter('firing')}>
                ✕ {lang === 'ur' ? 'فلٹر صاف کریں' : 'Clear Filters'}
              </button>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th className="rownum">#</th>
                <th>{t.date}</th>
                <th>{t.shift}</th>
                <th>{t.coalKg}</th>
                <th>{t.tempC}</th>
                <th>{t.fan}</th>
                <th>{lang === 'ur' ? 'جنریٹر گھنٹے' : 'Gen Hours'}</th>
              </tr>
              <tr className="filter-row no-print">
                <th className="rownum" />
                <th><input type="search" className="table-col-filter" value={filters.firing.date || ''} onChange={(e) => updateFilter('firing', 'date', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.firing.shift || ''} onChange={(e) => updateFilter('firing', 'shift', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.firing.coalKg || ''} onChange={(e) => updateFilter('firing', 'coalKg', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.firing.tempC || ''} onChange={(e) => updateFilter('firing', 'tempC', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.firing.fanOn || ''} onChange={(e) => updateFilter('firing', 'fanOn', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.firing.genHours || ''} onChange={(e) => updateFilter('firing', 'genHours', e.target.value)} /></th>
              </tr>
            </thead>
            <tbody>
              {filteredFiring.length === 0 ? (
                <tr><td colSpan="7" style={{ padding: '1.5rem', color: 'var(--muted)' }}>No records matching period</td></tr>
              ) : (
                filteredFiring.map((row, i) => (
                  <tr key={row._id || i}>
                    <td className="rownum">{i + 1}</td>
                    <td>{fmtDate(row.date)}</td>
                    <td><strong>{row.shift}</strong></td>
                    <td><strong>{Number(row.coalKg).toLocaleString()} kg</strong></td>
                    <td>{row.tempC ? `${row.tempC}°C` : '-'}</td>
                    <td>
                      <span className={`badge ${row.fanOn ? 'green' : 'red'}`}>
                        {row.fanOn ? 'ON' : 'OFF'}
                      </span>
                    </td>
                    <td>{row.genHours || 0} hrs</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="3">Total Coal Burned</td>
                <td>{filteredFiring.reduce((a, b) => a + (Number(b.coalKg) || 0), 0).toLocaleString()} kg</td>
                <td colSpan="3" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* MODULE 3: SALES TABLE */}
      {selectedModules.sales && (
        <div className="card table-wrap">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem' }}>
            <h2 style={{ margin: 0, border: 'none', padding: 0 }}>
              {lang === 'ur' ? 'اینٹ فروخت و ترسیل' : 'Brick Sales & Invoices'} ({filteredSales.length})
            </h2>
            {Object.values(filters.sales).some(Boolean) && (
              <button type="button" className="clear-filter-btn" onClick={() => clearFilter('sales')}>
                ✕ {lang === 'ur' ? 'فلٹر صاف کریں' : 'Clear Filters'}
              </button>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th className="rownum">#</th>
                <th>{t.date}</th>
                <th>{lang === 'ur' ? 'گاہک' : 'Customer'}</th>
                <th>{lang === 'ur' ? 'اینٹ کی قسم' : 'Grade'}</th>
                <th>{t.qty}</th>
                <th>{t.rate}</th>
                <th>{lang === 'ur' ? 'کل رقم' : 'Total Amount'}</th>
              </tr>
              <tr className="filter-row no-print">
                <th className="rownum" />
                <th><input type="search" className="table-col-filter" value={filters.sales.date || ''} onChange={(e) => updateFilter('sales', 'date', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.sales.customerName || ''} onChange={(e) => updateFilter('sales', 'customerName', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.sales.grade || ''} onChange={(e) => updateFilter('sales', 'grade', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.sales.qty || ''} onChange={(e) => updateFilter('sales', 'qty', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.sales.rate || ''} onChange={(e) => updateFilter('sales', 'rate', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.sales.totalRs || ''} onChange={(e) => updateFilter('sales', 'totalRs', e.target.value)} /></th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.length === 0 ? (
                <tr><td colSpan="7" style={{ padding: '1.5rem', color: 'var(--muted)' }}>No records matching period</td></tr>
              ) : (
                filteredSales.map((row, i) => (
                  <tr key={row._id || i}>
                    <td className="rownum">{i + 1}</td>
                    <td>{fmtDate(row.date)}</td>
                    <td><strong>{row.customerName || row.customer || '-'}</strong></td>
                    <td><span className="badge yellow">{row.grade || 'Awwal'}</span></td>
                    <td>{Number(row.qty).toLocaleString()}</td>
                    <td>{Number(row.rate || 0).toLocaleString()}</td>
                    <td><strong className="ok">{Number(row.totalRs || row.amount || 0).toLocaleString()}</strong></td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="4">Total Sales</td>
                <td>{filteredSales.reduce((a, b) => a + (Number(b.qty) || 0), 0).toLocaleString()}</td>
                <td />
                <td>{filteredSales.reduce((a, b) => a + (Number(b.totalRs || b.amount) || 0), 0).toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* MODULE 4: PESHGI ADVANCES */}
      {selectedModules.peshgi && (
        <div className="card table-wrap">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem' }}>
            <h2 style={{ margin: 0, border: 'none', padding: 0 }}>
              {lang === 'ur' ? 'پیشگی ایڈوانس کی تفصیل' : 'Peshgi Advances Record'} ({filteredPeshgi.length})
            </h2>
            {Object.values(filters.peshgi).some(Boolean) && (
              <button type="button" className="clear-filter-btn" onClick={() => clearFilter('peshgi')}>
                ✕ {lang === 'ur' ? 'فلٹر صاف کریں' : 'Clear Filters'}
              </button>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th className="rownum">#</th>
                <th>{t.date}</th>
                <th className="sticky-col">{t.worker}</th>
                <th>{lang === 'ur' ? 'رقم' : 'Amount'}</th>
                <th>{t.notes}</th>
              </tr>
              <tr className="filter-row no-print">
                <th className="rownum" />
                <th><input type="search" className="table-col-filter" value={filters.peshgi.date || ''} onChange={(e) => updateFilter('peshgi', 'date', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.peshgi.workerName || ''} onChange={(e) => updateFilter('peshgi', 'workerName', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.peshgi.amount || ''} onChange={(e) => updateFilter('peshgi', 'amount', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.peshgi.notes || ''} onChange={(e) => updateFilter('peshgi', 'notes', e.target.value)} /></th>
              </tr>
            </thead>
            <tbody>
              {filteredPeshgi.length === 0 ? (
                <tr><td colSpan="5" style={{ padding: '1.5rem', color: 'var(--muted)' }}>No records matching period</td></tr>
              ) : (
                filteredPeshgi.map((row, i) => (
                  <tr key={row._id || i}>
                    <td className="rownum">{i + 1}</td>
                    <td>{fmtDate(row.date)}</td>
                    <td><strong>{row.workerName || row.workerId || '-'}</strong></td>
                    <td><strong className="warn">{Number(row.amount).toLocaleString()}</strong></td>
                    <td>{row.notes || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="3">Total Peshgi Issued</td>
                <td>{filteredPeshgi.reduce((a, b) => a + (Number(b.amount) || 0), 0).toLocaleString()}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* MODULE 5: PURCHASES (GRN) */}
      {selectedModules.grn && (
        <div className="card table-wrap">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem' }}>
            <h2 style={{ margin: 0, border: 'none', padding: 0 }}>
              {lang === 'ur' ? 'خریداری و رسد (کوئلہ / مٹی)' : 'Procurement & GRN'} ({filteredGrn.length})
            </h2>
            {Object.values(filters.grn).some(Boolean) && (
              <button type="button" className="clear-filter-btn" onClick={() => clearFilter('grn')}>
                ✕ {lang === 'ur' ? 'فلٹر صاف کریں' : 'Clear Filters'}
              </button>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th className="rownum">#</th>
                <th>{t.date}</th>
                <th>{lang === 'ur' ? 'آئٹم' : 'Item'}</th>
                <th>{lang === 'ur' ? 'سپلائر' : 'Supplier'}</th>
                <th>{lang === 'ur' ? 'گاڑی نمبر' : 'Vehicle #'}</th>
                <th>{t.qty}</th>
                <th>{t.rate}</th>
                <th>{lang === 'ur' ? 'کل خرچ' : 'Landed Total'}</th>
              </tr>
              <tr className="filter-row no-print">
                <th className="rownum" />
                <th><input type="search" className="table-col-filter" value={filters.grn.date || ''} onChange={(e) => updateFilter('grn', 'date', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.grn.item || ''} onChange={(e) => updateFilter('grn', 'item', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.grn.supplierName || ''} onChange={(e) => updateFilter('grn', 'supplierName', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.grn.vehicleNo || ''} onChange={(e) => updateFilter('grn', 'vehicleNo', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.grn.qty || ''} onChange={(e) => updateFilter('grn', 'qty', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.grn.rate || ''} onChange={(e) => updateFilter('grn', 'rate', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.grn.landedTotal || ''} onChange={(e) => updateFilter('grn', 'landedTotal', e.target.value)} /></th>
              </tr>
            </thead>
            <tbody>
              {filteredGrn.length === 0 ? (
                <tr><td colSpan="8" style={{ padding: '1.5rem', color: 'var(--muted)' }}>No records matching period</td></tr>
              ) : (
                filteredGrn.map((row, i) => (
                  <tr key={row._id || i}>
                    <td className="rownum">{i + 1}</td>
                    <td>{fmtDate(row.date)}</td>
                    <td><strong style={{ textTransform: 'capitalize' }}>{row.item}</strong></td>
                    <td>{row.supplierName || '-'}</td>
                    <td>{row.vehicleNo || '-'}</td>
                    <td>{Number(row.qty).toLocaleString()}</td>
                    <td>{Number(row.rate).toLocaleString()}</td>
                    <td><strong>{Number(row.landedTotal || 0).toLocaleString()}</strong></td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="7">Total Procurement</td>
                <td>{filteredGrn.reduce((a, b) => a + (Number(b.landedTotal) || 0), 0).toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* MODULE 6: CASH BOOK */}
      {selectedModules.cashbook && (
        <div className="card table-wrap">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem' }}>
            <h2 style={{ margin: 0, border: 'none', padding: 0 }}>
              {lang === 'ur' ? 'کیش بک (آمدن و خرچ روزنامچہ)' : 'Cash Book Transactions'} ({filteredCashbook.length})
            </h2>
            {Object.values(filters.cashbook).some(Boolean) && (
              <button type="button" className="clear-filter-btn" onClick={() => clearFilter('cashbook')}>
                ✕ {lang === 'ur' ? 'فلٹر صاف کریں' : 'Clear Filters'}
              </button>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th className="rownum">#</th>
                <th>{t.date}</th>
                <th>{lang === 'ur' ? 'قسم' : 'Type'}</th>
                <th>{lang === 'ur' ? 'تفصیل' : 'Description'}</th>
                <th>{lang === 'ur' ? 'آمدن (In)' : 'Cash In'}</th>
                <th>{lang === 'ur' ? 'خرچ (Out)' : 'Cash Out'}</th>
              </tr>
              <tr className="filter-row no-print">
                <th className="rownum" />
                <th><input type="search" className="table-col-filter" value={filters.cashbook.date || ''} onChange={(e) => updateFilter('cashbook', 'date', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.cashbook.type || ''} onChange={(e) => updateFilter('cashbook', 'type', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.cashbook.desc || ''} onChange={(e) => updateFilter('cashbook', 'desc', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.cashbook.amountIn || ''} onChange={(e) => updateFilter('cashbook', 'amountIn', e.target.value)} /></th>
                <th><input type="search" className="table-col-filter" value={filters.cashbook.amountOut || ''} onChange={(e) => updateFilter('cashbook', 'amountOut', e.target.value)} /></th>
              </tr>
            </thead>
            <tbody>
              {filteredCashbook.length === 0 ? (
                <tr><td colSpan="6" style={{ padding: '1.5rem', color: 'var(--muted)' }}>No records matching period</td></tr>
              ) : (
                filteredCashbook.map((row, i) => {
                  const isIn = row.type === 'in' || row.type === 'deposit';
                  return (
                    <tr key={row._id || i}>
                      <td className="rownum">{i + 1}</td>
                      <td>{fmtDate(row.date)}</td>
                      <td>
                        <span className={`badge ${isIn ? 'green' : 'red'}`}>
                          {isIn ? (lang === 'ur' ? 'آمدن' : 'In') : (lang === 'ur' ? 'خرچ' : 'Out')}
                        </span>
                      </td>
                      <td style={{ textAlign: 'start' }}>{row.desc || row.notes || '-'}</td>
                      <td>{isIn ? <strong className="ok">{Number(row.amount).toLocaleString()}</strong> : '-'}</td>
                      <td>{!isIn ? <strong className="err">{Number(row.amount).toLocaleString()}</strong> : '-'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="4">Totals</td>
                <td className="ok">{filteredCashbook.filter((x) => x.type === 'in' || x.type === 'deposit').reduce((a, b) => a + (Number(b.amount) || 0), 0).toLocaleString()}</td>
                <td className="err">{filteredCashbook.filter((x) => x.type === 'out' || x.type === 'expense').reduce((a, b) => a + (Number(b.amount) || 0), 0).toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
