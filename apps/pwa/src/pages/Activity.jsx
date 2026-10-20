import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, fmtDateTime } from '../api.js';
import DateTime from '../components/DateTime.jsx';
import { Card, CardBody, Chips, DateRange, TableCard, tbl, FilterInput, ClearFilters, Empty, Badge, cx } from '../components/ui.jsx';

const KIND_LABEL_KEY = {
  moulding: 'moulding', load: 'loadSection', firing: 'firing', unload: 'nikasiTab',
  grn: 'grnTitle', invoice: 'newInvoice', payment: 'recordPayment', ledger: 'ledgerHistory',
};

export default function Activity() {
  const t = useT();
  const [rows, setRows] = useState([]);
  const [kind, setKind] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [colFilters, setColFilters] = useState({});

  useEffect(() => { get('/activity?limit=300').then((r) => setRows(Array.isArray(r) ? r : r?.rows || [])).catch(() => setRows([])); }, []);

  const kindText = (k) => t[KIND_LABEL_KEY[k]] || k;
  const has = (v, q) => !q || String(v ?? '').toLowerCase().includes(q.toLowerCase());
  const filtered = rows.filter((r) => {
    if (kind !== 'all' && r.kind !== kind) return false;
    if (fromDate && new Date(r.at) < new Date(`${fromDate}T00:00:00+05:00`)) return false;
    if (toDate && new Date(r.at) > new Date(`${toDate}T23:59:59.999+05:00`)) return false;
    return has(fmtDateTime(r.at), colFilters.at) && has(kindText(r.kind), colFilters.kind) && has(r.summary, colFilters.summary);
  });
  const kinds = ['all', ...new Set(rows.map((r) => r.kind))];

  return (
    <div className="grid gap-4">
      <Card>
        <CardBody>
          <Chips options={kinds.map((k) => [k, k === 'all' ? t.all : kindText(k)])} value={kind} onChange={setKind} />
          <DateRange from={fromDate} to={toDate} onFrom={setFromDate} onTo={setToDate} fromLabel={t.fromDate} toLabel={t.toDate} />
        </CardBody>
      </Card>

      <TableCard
        title={`${t.activity} (${filtered.length} / ${rows.length})`}
        actions={<ClearFilters show={Object.values(colFilters).some(Boolean)} onClick={() => setColFilters({})} label={t.clearAll} />}
      >
        <table className={tbl.table}>
          <thead>
            <tr>
              <th className={cx('rownum', tbl.th)}>#</th><th className={tbl.th}>{t.dateTime}</th><th className={tbl.th}>{t.type}</th><th className={tbl.th}>{t.details}</th>
            </tr>
            <tr className="filter-row">
              <th className={cx('rownum', tbl.fth)} />
              {['at', 'kind', 'summary'].map((k) => (
                <th key={k} className={tbl.fth}><FilterInput aria-label={k} value={colFilters[k] || ''} onChange={(e) => setColFilters({ ...colFilters, [k]: e.target.value })} /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i} className={tbl.tr}>
                <td className={cx('rownum', tbl.td, 'text-n-500')}>{i + 1}</td>
                <td className={cx(tbl.td, 'whitespace-nowrap')}><DateTime value={r.at} /></td>
                <td className={tbl.td}><Badge tone="brand">{kindText(r.kind)}</Badge></td>
                <td className={cx(tbl.td, 'min-w-56 whitespace-normal text-start')}>{r.summary}</td>
              </tr>
            ))}
            {!filtered.length && <Empty cols={4}>{t.noEntries}</Empty>}
          </tbody>
        </table>
      </TableCard>
    </div>
  );
}
