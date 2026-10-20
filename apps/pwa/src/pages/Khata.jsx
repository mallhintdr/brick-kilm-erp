import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, fmtDate } from '../api.js';
import SearchSelect from '../components/SearchSelect.jsx';
import { useTypes } from '../useTypes.js';
import { Card, CardHeader, CardBody, Field, Alert, Section, StatGrid, StatCard, TableCard, tbl, FilterInput, ClearFilters, Empty } from '../components/ui.jsx';

const rs = (n) => (n ? Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '');

// General ledger (khata) of one worker: every entry from day one, like the paper khata book.
export default function Khata() {
  const t = useT();
  const cats = useTypes('workerCategory');
  const [workers, setWorkers] = useState([]);
  const [workerId, setWorkerId] = useState('');
  const [khata, setKhata] = useState(null);
  const [err, setErr] = useState('');
  const [lf, setLf] = useState({});

  useEffect(() => { get('/workers').then((w) => setWorkers(w.sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {}); }, []);
  useEffect(() => {
    if (!workerId) { setKhata(null); return; }
    setErr('');
    get(`/khata/${workerId}`).then(setKhata).catch((e) => setErr(e.message));
  }, [workerId]);

  const has = (v, q) => !q || String(v ?? '').toLowerCase().includes(q.toLowerCase());
  const rows = (khata?.rows || []).filter((r) => has(fmtDate(r.at), lf.date) && has(r.detail, lf.detail) && has(r.naam, lf.naam) && has(r.jama, lf.jama));
  const bal = khata?.totals.balance || 0;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title={t.khataTitle} />
        <CardBody>
          <Field label={t.worker}>
            <SearchSelect
              ariaLabel={t.worker} placeholder={t.typeToSearch} value={workerId} onChange={setWorkerId}
              options={workers.map((w) => ({
                value: w._id,
                label: `${w.fatherName ? `${w.name} — ${w.fatherName}` : w.name} (${cats.label(w.category)})`,
                search: `${w.cnic || ''} ${w.phone || ''}`,
              }))}
            />
          </Field>
          {err && <Alert tone="err">{err}</Alert>}
        </CardBody>
      </Card>

      {khata && (
        <>
          <Card className="p-4">
            <Section title={`${t.khataOf} ${khata.worker.name}${khata.worker.fatherName ? ` — ${khata.worker.fatherName}` : ''}`}>
              <StatGrid className="sm:grid-cols-3 lg:grid-cols-3">
                <StatCard label={t.naamGiven} value={rs(khata.totals.naam) || 0} tone="amber" />
                <StatCard label={t.jamaEarned} value={rs(khata.totals.jama) || 0} tone="green" />
                <StatCard label={t.baqaya} value={rs(bal) || 0} tone={bal > 0 ? 'red' : 'green'} className="col-span-2 sm:col-span-1" />
              </StatGrid>
            </Section>
          </Card>

          <TableCard
            title={`${t.khataTitle} (${rows.length})`}
            actions={<ClearFilters show={Object.values(lf).some(Boolean)} onClick={() => setLf({})} label={t.clearAll} />}
          >
            <table className={tbl.table}>
              <thead>
                <tr>
                  <th className={`rownum ${tbl.th}`}>{t.serialNo}</th>
                  <th className={`sticky-col ${tbl.th}`}>{t.date}</th>
                  <th className={tbl.th}>{t.details}</th>
                  <th className={tbl.th}>{t.naamRs}</th>
                  <th className={tbl.th}>{t.jamaRs}</th>
                  <th className={tbl.th}>{t.baqaya}</th>
                </tr>
                <tr className="filter-row">
                  <th className={`rownum ${tbl.fth}`} />
                  {['date', 'detail', 'naam', 'jama'].map((k) => (
                    <th key={k} className={`${k === 'date' ? 'sticky-col ' : ''}${tbl.fth}`}>
                      <FilterInput aria-label={k} value={lf[k] || ''} onChange={(e) => setLf({ ...lf, [k]: e.target.value })} />
                    </th>
                  ))}
                  <th className={tbl.fth} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.no} className={tbl.tr}>
                    <td className={`rownum ${tbl.td} text-n-500`}>{r.no}</td>
                    <td className={`${tbl.td} font-semibold`}>{fmtDate(r.at)}</td>
                    <td className={`${tbl.td} text-start whitespace-normal min-w-56`}>{r.detail}</td>
                    <td className={`${tbl.td} text-caution`}>{rs(r.naam)}</td>
                    <td className={`${tbl.td} text-gain`}>{rs(r.jama)}</td>
                    <td className={`${tbl.td} font-bold ${r.balance > 0 ? 'text-loss' : 'text-gain'}`}>{rs(r.balance) || 0}</td>
                  </tr>
                ))}
                {!rows.length && <Empty cols={6}>{t.noEntries}</Empty>}
              </tbody>
            </table>
          </TableCard>
        </>
      )}
    </div>
  );
}
