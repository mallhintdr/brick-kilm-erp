import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, fmtDateTime } from '../api.js';
import DateTime from '../components/DateTime.jsx';
import { Card, CardBody, Chips, DateRange, Alert, TableCard, tbl, FilterInput, ClearFilters, Empty, Badge, cx } from '../components/ui.jsx';

export default function AuditLogs() {
  const t = useT();
  const [action, setAction] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [data, setData] = useState({ total: 0, actions: [], entries: [] });
  const [err, setErr] = useState('');
  const [colFilters, setColFilters] = useState({});

  useEffect(() => {
    let qs = '?limit=200';
    if (action) qs += `&action=${encodeURIComponent(action)}`;
    if (fromDate) qs += `&from=${fromDate}`;
    if (toDate) qs += `&to=${toDate}`;
    get(`/audit-logs${qs}`).then(setData).catch((e) => setErr(e.message));
  }, [action, fromDate, toDate]);

  const has = (v, q) => !q || String(v ?? '').toLowerCase().includes(q.toLowerCase());
  const shown = data.entries.filter((e) => has(fmtDateTime(e.at), colFilters.at) && has(e.actor, colFilters.actor)
    && has(e.action, colFilters.action) && has(summarize(e.data), colFilters.details));

  return (
    <div className="grid gap-4">
      <Card>
        <CardBody>
          <Chips options={[['', t.all], ...data.actions.map((a) => [a, a])]} value={action} onChange={setAction} />
          <DateRange from={fromDate} to={toDate} onFrom={setFromDate} onTo={setToDate} fromLabel={t.fromDate} toLabel={t.toDate} />
        </CardBody>
      </Card>

      {err && <Alert tone="err">{err}</Alert>}

      <TableCard
        title={`${t.auditLogs} (${shown.length} / ${data.entries.length})`}
        actions={<ClearFilters show={Object.values(colFilters).some(Boolean)} onClick={() => setColFilters({})} label={t.clearAll} />}
      >
        <table className={tbl.table}>
          <thead>
            <tr>
              <th className={cx('rownum', tbl.th)}>#</th><th className={tbl.th}>{t.dateTime}</th>
              <th className={cx('sticky-col', tbl.th)}>{t.name}</th><th className={tbl.th}>{t.type}</th><th className={tbl.th}>{t.details}</th>
            </tr>
            <tr className="filter-row">
              <th className={cx('rownum', tbl.fth)} />
              {['at', 'actor', 'action', 'details'].map((k) => (
                <th key={k} className={tbl.fth}><FilterInput aria-label={k} value={colFilters[k] || ''} onChange={(e) => setColFilters({ ...colFilters, [k]: e.target.value })} /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((e, i) => (
              <tr key={e._id} className={tbl.tr}>
                <td className={cx('rownum', tbl.td, 'text-n-500')}>{i + 1}</td>
                <td className={tbl.td}><DateTime value={e.at} /></td>
                <td className={cx(tbl.td, 'font-semibold')}>{e.actor}</td>
                <td className={tbl.td}><Badge>{e.action}</Badge></td>
                <td className={cx(tbl.td, 'min-w-56 whitespace-normal text-start text-sm')}>{summarize(e.data)}</td>
              </tr>
            ))}
            {!shown.length && <Empty cols={5}>{t.noEntries}</Empty>}
          </tbody>
        </table>
      </TableCard>
    </div>
  );
}

// Keeps the Details column compact: show the fields a munshi would recognize, not raw JSON.
function summarize(data) {
  if (!data || typeof data !== 'object') return '';
  const picked = ['amount', 'reason', 'key', 'kind', 'id', 'workerId', 'label', 'index', 'count'];
  const parts = picked.filter((k) => data[k] !== undefined).map((k) => `${k}: ${data[k]}`);
  return parts.join(', ') || JSON.stringify(data).slice(0, 80);
}
