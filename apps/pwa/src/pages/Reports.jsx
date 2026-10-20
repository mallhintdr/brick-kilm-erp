import { useEffect, useMemo, useState } from 'react';
import { useT, useLang } from '../i18n.js';
import { get, fmtDate, fmtDateDM } from '../api.js';
import DateTime from '../components/DateTime.jsx';
import StockReport from '../components/StockReport.jsx';
import { Card, CardHeader, CardBody, Field, Input, Select, FormGrid, Button, Section, StatGrid, StatCard, Badge, TableCard, tbl, FilterInput, ClearFilters, Empty, cx } from '../components/ui.jsx';

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
    bharai: {},
    nikasi: {},
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


  const ur = lang === 'ur';
  const L = (en, u) => (ur ? u : en);
  const n = (v) => Number(v || 0).toLocaleString();
  const sumOf = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const where = (r) => `${r.unit === 'line' ? t.line : t.section} ${r.sectionIndex}`;
  const isIn = (r) => r.type === 'in' || r.type === 'deposit';
  const nik = data.nikasi || [];
  const bharai = data.bharai || [];

  // every report table: columns (label, value, filter key, style) and an optional total row
  const TABLES = [
    selectedModules.bharai && {
      id: 'bharai', title: `${L('Kachi Bharai (Loading)', 'کچی بھرائی')} — ${n(sumOf(bharai, 'count'))}`, rows: bharai,
      cols: [
        { label: t.date, v: (r) => <DateTime value={r.date} /> },
        { label: `${t.line} / ${t.section}`, v: where },
        { label: L('Bricks', 'اینٹیں'), v: (r) => n(r.count), cls: 'font-bold' },
      ],
    },
    selectedModules.nikasi && {
      id: 'nikasi', title: L('Nikasi (Unloading) — details', 'نکاسی — تفصیل'), rows: nik,
      cols: [
        { label: t.date, v: (r) => <DateTime value={r.date} /> },
        { label: `${t.line} / ${t.section}`, v: where },
        { label: t.awwal, v: (r) => n(r.awwal) }, { label: t.doem, v: (r) => n(r.doem) },
        { label: t.khangar, v: (r) => n(r.khangar) }, { label: t.broken, v: (r) => n(r.broken) },
      ],
    },
    selectedModules.moulding && {
      id: 'moulding', title: `${L('Moulding Production Records', 'کچی اینٹ (پتھائی) کا ریکارڈ')} (${filteredMoulding.length})`, rows: filteredMoulding,
      cols: [
        { label: t.date, v: (r) => fmtDate(r.date), f: 'date' },
        { label: t.team, v: (r) => r.teamName || r.teamId || '-', f: 'teamId' },
        { label: L('Gross Bricks', 'کل کچی'), v: (r) => n(r.count), f: 'count', cls: 'font-bold' },
        { label: L('Net Bricks', 'خالص کچی'), v: (r) => n(r.netCount), f: 'netCount', cls: 'font-bold text-gain' },
        { label: t.status, v: (r) => <Badge tone="ok">{r.status || 'drying'}</Badge>, f: 'status' },
      ],
      foot: [t.total, null, n(sumOf(filteredMoulding, 'count')), n(sumOf(filteredMoulding, 'netCount')), ''],
    },
    (selectedModules.firing || selectedModules.coal) && {
      id: 'firing', title: `${L('Firing Shifts & Coal Consumption', 'پکائی و کوئلہ کھپت')} (${filteredFiring.length})`, rows: filteredFiring,
      cols: [
        { label: t.date, v: (r) => fmtDate(r.date), f: 'date' },
        { label: t.shift, v: (r) => (r.shift === 'day' ? t.day : t.night), f: 'shift' },
        { label: t.lineNo, v: (r) => r.lineIndex || '—', f: 'lineIndex' },
        { label: t.coalKg, v: (r) => `${n(r.coalKg)} kg`, f: 'coalKg', cls: 'font-bold' },
        { label: t.tempC, v: (r) => (r.tempC ? `${r.tempC}°C` : '-'), f: 'tempC' },
      ],
      foot: [t.total, null, null, `${n(sumOf(filteredFiring, 'coalKg'))} kg`, ''],
    },
    selectedModules.sales && {
      id: 'sales', title: `${L('Brick Sales & Invoices', 'اینٹ فروخت و ترسیل')} (${filteredSales.length})`, rows: filteredSales,
      cols: [
        { label: t.date, v: (r) => fmtDate(r.date), f: 'date' },
        { label: t.customer, v: (r) => r.customerName || r.customer || '-', f: 'customerName', cls: 'font-semibold' },
        { label: t.grade, v: (r) => <Badge>{t[r.grade] || r.grade || '-'}</Badge>, f: 'grade' },
        { label: t.qty, v: (r) => n(r.qty), f: 'qty' },
        { label: t.rate, v: (r) => n(r.rate), f: 'rate' },
        { label: t.amount, v: (r) => n(r.totalRs || r.amount), f: 'totalRs', cls: 'font-bold text-gain' },
      ],
      foot: [t.total, null, null, n(sumOf(filteredSales, 'qty')), '', n(filteredSales.reduce((a, b) => a + (Number(b.totalRs || b.amount) || 0), 0))],
    },
    selectedModules.peshgi && {
      id: 'peshgi', title: `${L('Peshgi Advances Record', 'پیشگی ایڈوانس کی تفصیل')} (${filteredPeshgi.length})`, rows: filteredPeshgi,
      cols: [
        { label: t.date, v: (r) => fmtDate(r.date), f: 'date' },
        { label: t.worker, v: (r) => r.workerName || r.workerId || '-', f: 'workerName', cls: 'font-semibold' },
        { label: t.amount, v: (r) => n(r.amount), f: 'amount', cls: 'font-bold text-caution' },
        { label: t.notes, v: (r) => r.notes || '-', f: 'notes' },
      ],
      foot: [t.total, null, n(sumOf(filteredPeshgi, 'amount')), ''],
    },
    selectedModules.grn && {
      id: 'grn', title: `${L('Procurement & GRN', 'خریداری و رسد')} (${filteredGrn.length})`, rows: filteredGrn,
      cols: [
        { label: t.date, v: (r) => fmtDate(r.date), f: 'date' },
        { label: t.item, v: (r) => r.item, f: 'item', cls: 'font-semibold capitalize' },
        { label: t.supplier, v: (r) => r.supplierName || '-', f: 'supplierName' },
        { label: t.vehicle, v: (r) => r.vehicleNo || r.description || '-', f: 'vehicleNo' },
        { label: t.qty, v: (r) => n(r.qty), f: 'qty' },
        { label: t.rate, v: (r) => n(r.rate), f: 'rate' },
        { label: t.landedCost, v: (r) => n(r.landedTotal), f: 'landedTotal', cls: 'font-bold' },
      ],
      foot: [t.total, null, null, null, null, null, n(sumOf(filteredGrn, 'landedTotal'))],
    },
    selectedModules.cashbook && {
      id: 'cashbook', title: `${L('Cash Book Transactions', 'کیش بک')} (${filteredCashbook.length})`, rows: filteredCashbook,
      cols: [
        { label: t.date, v: (r) => fmtDate(r.date), f: 'date' },
        { label: t.type, v: (r) => <Badge tone={isIn(r) ? 'ok' : 'err'}>{isIn(r) ? L('In', 'آمدن') : L('Out', 'خرچ')}</Badge>, f: 'type' },
        { label: t.details, v: (r) => r.desc || r.notes || '-', f: 'desc', cls: 'text-start whitespace-normal min-w-40' },
        { label: L('Cash In', 'آمدن'), v: (r) => (isIn(r) ? n(r.amount) : '-'), cls: 'font-bold text-gain' },
        { label: L('Cash Out', 'خرچ'), v: (r) => (!isIn(r) ? n(r.amount) : '-'), cls: 'font-bold text-loss' },
      ],
      foot: [t.total, null, null, n(sumOf(filteredCashbook.filter(isIn), 'amount')), n(sumOf(filteredCashbook.filter((x) => !isIn(x)), 'amount'))],
    },
  ].filter(Boolean);

  return (
    <div className="grid gap-4">
      {/* settings: period and which parts to include (not printed) */}
      <Card className="no-print">
        <CardHeader title={L('Kiln Operations Reports', 'جامع کاروباری رپورٹ')}>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => window.print()}>🖨️ {L('Print / PDF', 'پرنٹ / پی ڈی ایف')}</Button>
            <Button size="sm" variant="secondary" loading={loading} onClick={generateReport}>🔄 {L('Refresh', 'ریفریش')}</Button>
          </div>
        </CardHeader>
        <CardBody>
          <FormGrid>
            <Field label={L('Report period', 'رپورٹ کی مدت')}>
              <Select value={range} onChange={(e) => {
                const val = e.target.value === 'custom' ? 'custom' : Number(e.target.value);
                setRange(val);
                if (val !== 'custom') { setFromDate(daysAgoStr(val)); setToDate(todayStr()); }
              }}>
                {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </Select>
            </Field>
            {range === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <Field label={t.fromDate}><Input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} /></Field>
                <Field label={t.toDate}><Input type="date" value={toDate} min={fromDate} max={todayStr()} onChange={(e) => setToDate(e.target.value)} /></Field>
              </div>
            )}
          </FormGrid>
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-md font-semibold text-n-700">☑ {L('Include in report', 'رپورٹ میں شامل کریں')}</span>
              <div className="flex gap-1.5">
                <Button size="sm" variant="secondary" className="min-h-8 text-xs" onClick={() => selectAll(true)}>{L('Select all', 'تمام منتخب کریں')}</Button>
                <Button size="sm" variant="secondary" className="min-h-8 text-xs" onClick={() => selectAll(false)}>{L('Clear', 'غیر منتخب')}</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
              {REPORT_MODULES.map((m) => {
                const on = !!selectedModules[m.id];
                return (
                  <label key={m.id} className={cx('flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold ring-1', on ? 'bg-brand-50 text-n-900' : 'bg-n-50 text-n-500 ring-n-200')}
                    style={on ? { '--tw-ring-color': m.color } : undefined}>
                    <input type="checkbox" className="size-4 min-h-0" style={{ accentColor: m.color }} checked={on} onChange={() => toggleModule(m.id)} />
                    <span className="truncate">{ur ? m.ur : m.en}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* printable title with the period on one line */}
      <Card className="report-head grid gap-2 px-4 py-3 text-center">
        <h1 className="m-0 text-xl font-bold text-n-900">{L('Operations Report', 'جامع آپریشنل رپورٹ')}</h1>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-md">
          <span className="text-n-500">{t.fromDate}</span><strong>{fmtDate(fromDate)}</strong>
          <span className="text-n-500">{t.toDate}</span><strong>{fmtDate(toDate)}</strong>
        </div>
      </Card>

      <Card className="grid gap-4 p-4">
        <Section title={L('Period summary', 'مدت کا خلاصہ')}>
          <StatGrid className="sm:grid-cols-4 lg:grid-cols-4">
            {selectedModules.moulding && <StatCard label={L('Total moulded', 'کل کچی پتھائی')} value={n(stats.totalMoulded)} tone="orange" />}
            {selectedModules.firing && <StatCard label={L('Firing shifts', 'پکائی شفٹیں')} value={stats.totalShifts} tone="red" />}
            {selectedModules.coal && <StatCard label={L('Coal burned', 'کوئلہ کھپت')} value={`${n(stats.totalCoalKg)} kg`} tone="slate" />}
            {selectedModules.sales && <StatCard label={L('Sales revenue', 'کل فروخت آمدن')} value={n(stats.totalSalesRev)} tone="green" />}
            {selectedModules.peshgi && <StatCard label={L('Peshgi issued', 'پیشگی جاری کردہ')} value={n(stats.totalPeshgi)} tone="amber" />}
            {selectedModules.kharchi && <StatCard label={L('Kharchi paid', 'خرچی و اجرت')} value={n(stats.totalKharchi)} tone="violet" />}
            {selectedModules.grn && <StatCard label={L('Purchases', 'خریداری خرچ')} value={n(stats.totalPurchases)} tone="blue" />}
            {selectedModules.cashbook && <StatCard label={L('Net cash flow', 'خالص کیش فلو')} value={n(stats.cashNet)} tone={stats.cashNet >= 0 ? 'green' : 'red'} />}
          </StatGrid>
        </Section>
        {selectedModules.nikasi && (
          <Section title={L('Nikasi (Unloading)', 'نکاسی')}>
            <StatGrid className="grid-cols-4 sm:grid-cols-4 lg:grid-cols-4">
              <StatCard label={t.awwal} value={n(sumOf(nik, 'awwal'))} tone="green" />
              <StatCard label={t.doem} value={n(sumOf(nik, 'doem'))} tone="blue" />
              <StatCard label={t.khangar} value={n(sumOf(nik, 'khangar'))} tone="amber" />
              <StatCard label={t.broken} value={n(sumOf(nik, 'broken'))} tone="red" />
            </StatGrid>
          </Section>
        )}
      </Card>

      {selectedModules.stock && <Card className="p-4"><StockReport /></Card>}

      {TABLES.map((tb) => <ReportTable key={tb.id} tb={tb} t={t} filters={filters[tb.id] || {}} onFilter={(k, v) => updateFilter(tb.id, k, v)} onClear={() => clearFilter(tb.id)} />)}
    </div>
  );
}

// One report table: peach header, optional filter row (not printed), zebra rows, total row.
function ReportTable({ tb, t, filters, onFilter, onClear }) {
  const filterable = tb.cols.some((c) => c.f);
  return (
    <TableCard title={tb.title} actions={<span className="no-print"><ClearFilters show={Object.values(filters).some(Boolean)} onClick={onClear} label={t.clearAll} /></span>}>
      <table className={tbl.table}>
        <thead>
          <tr>
            <th className={cx('rownum', tbl.th)}>#</th>
            {tb.cols.map((c, i) => <th key={i} className={tbl.th}>{c.label}</th>)}
          </tr>
          {filterable && (
            <tr className="filter-row no-print">
              <th className={cx('rownum', tbl.fth)} />
              {tb.cols.map((c, i) => (
                <th key={i} className={tbl.fth}>{c.f && <FilterInput aria-label={c.label} value={filters[c.f] || ''} onChange={(e) => onFilter(c.f, e.target.value)} />}</th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {tb.rows.map((r, i) => (
            <tr key={r._id || i} className={tbl.tr}>
              <td className={cx('rownum', tbl.td, 'text-n-500')}>{i + 1}</td>
              {tb.cols.map((c, j) => <td key={j} className={cx(tbl.td, c.cls)}>{c.v(r)}</td>)}
            </tr>
          ))}
          {!tb.rows.length && <Empty cols={tb.cols.length + 1}>{t.noEntries}</Empty>}
        </tbody>
        {tb.foot && tb.rows.length > 0 && (
          <tfoot>
            <tr className="bg-n-100 font-bold">
              <td className={tbl.td} />
              {tb.foot.map((v, i) => <td key={i} className={tbl.td}>{v}</td>)}
            </tr>
          </tfoot>
        )}
      </table>
    </TableCard>
  );
}
