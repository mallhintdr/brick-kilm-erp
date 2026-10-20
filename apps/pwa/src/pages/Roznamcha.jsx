import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, fmtDate } from '../api.js';
import { Card, CardHeader, CardBody, Input, Alert, Section, StatGrid, StatCard, toneAt, TableCard, tbl, FilterInput, ClearFilters, Empty, Badge } from '../components/ui.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const TYPES = ['moulding', 'bharai', 'nikasi', 'sale', 'payment', 'purchase', 'coalArrival', 'coalUse', 'peshgi', 'dasti', 'issue', 'absent'];

// Roznamcha: the day's report, every entry made that day in time order.
export default function Roznamcha() {
  const t = useT();
  const [date, setDate] = useState(today());
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [lf, setLf] = useState({});

  useEffect(() => {
    setErr('');
    get(`/roznamcha?date=${date}`).then(setData).catch((e) => setErr(e.message));
  }, [date]);

  const typeText = (k) => t[`rz_${k}`] || k;
  const has = (v, q) => !q || String(v ?? '').toLowerCase().includes(q.toLowerCase());
  const rows = (data?.rows || []).filter((r) => has(typeText(r.type), lf.type) && has(r.detail, lf.detail));
  const count = (k) => (data?.rows || []).filter((r) => r.type === k).length;
  const counted = TYPES.filter((k) => count(k));

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title={t.roznamcha} />
        <CardBody>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} className="max-w-52" />
            <strong className="text-lg text-n-900">{fmtDate(date)}</strong>
          </div>
          {err && <Alert tone="err">{err}</Alert>}
        </CardBody>
      </Card>

      {data && (
        <Card className="p-4">
          <Section title={t.daySummary}>
            <StatGrid>
              {counted.map((k, i) => <StatCard key={k} label={typeText(k)} value={count(k)} tone={toneAt(i)} />)}
              {!counted.length && <StatCard label={t.noEntries} value={0} tone="slate" />}
            </StatGrid>
          </Section>
        </Card>
      )}

      {data && (
        <TableCard
          title={`${t.roznamcha} (${rows.length})`}
          actions={<ClearFilters show={Object.values(lf).some(Boolean)} onClick={() => setLf({})} label={t.clearAll} />}
        >
          <table className={tbl.table}>
            <thead>
              <tr>
                <th className={`rownum ${tbl.th}`}>{t.serialNo}</th>
                <th className={tbl.th}>{t.wxTime}</th>
                <th className={`sticky-col ${tbl.th}`}>{t.entryType}</th>
                <th className={tbl.th}>{t.details}</th>
                <th className={tbl.th}>{t.amount}</th>
              </tr>
              <tr className="filter-row">
                <th className={`rownum ${tbl.fth}`} /><th className={tbl.fth} />
                <th className={`sticky-col ${tbl.fth}`}><FilterInput aria-label={t.entryType} value={lf.type || ''} onChange={(e) => setLf({ ...lf, type: e.target.value })} /></th>
                <th className={tbl.fth}><FilterInput aria-label={t.details} value={lf.detail || ''} onChange={(e) => setLf({ ...lf, detail: e.target.value })} /></th>
                <th className={tbl.fth} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.no} className={tbl.tr}>
                  <td className={`rownum ${tbl.td} text-n-500`}>{r.no}</td>
                  <td className={tbl.td}>{new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td className={tbl.td}><Badge tone={r.type === 'issue' || r.type === 'absent' ? 'err' : r.amount ? 'brand' : 'neutral'}>{typeText(r.type)}</Badge></td>
                  <td className={`${tbl.td} text-start whitespace-normal min-w-56`}>{r.detail}</td>
                  <td className={tbl.td}>{r.amount ? <strong>{Number(r.amount).toLocaleString()}</strong> : r.qty ? Number(r.qty).toLocaleString() : '—'}</td>
                </tr>
              ))}
              {!rows.length && <Empty cols={5}>{t.noEntries}</Empty>}
            </tbody>
          </table>
        </TableCard>
      )}
    </div>
  );
}
