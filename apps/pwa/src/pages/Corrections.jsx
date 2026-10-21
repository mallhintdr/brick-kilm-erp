import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n.js';
import { get, put, del } from '../api.js';
import DateTime from '../components/DateTime.jsx';
import { IconBtn } from '../components/RowActions.jsx';
import { Card, CardHeader, CardBody, Field, Input, FormGrid, Alert, Muted, Tabs, TableCard, tbl, Empty, cx } from '../components/ui.jsx';

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));
const where = (r, t) => (r.unit === 'grid' ? t.weeklyEntry : `${r.unit === 'line' ? t.line : t.section} ${r.sectionIndex}`);

// Corrections & erase (owner): fix or remove loading and nikasi records in one place.
// Wages follow every change; moulding and firing are corrected on their own pages.
export default function Corrections() {
  const t = useT();
  const [tab, setTab] = useState('loads');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(daysAgo(0));
  const [rows, setRows] = useState([]);
  const [teams, setTeams] = useState([]);
  const [edit, setEdit] = useState(null); // { id, ...fields }
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [q, setQ] = useState('');

  const path = tab === 'loads' ? '/corrections/loads' : '/corrections/nikasi';
  const load = () => get(`${path}?from=${from}&to=${to}`).then(setRows).catch((e) => { setRows([]); setMsg({ text: e.message, bad: true }); });
  useEffect(() => { setEdit(null); if (tab === 'loads' || tab === 'nikasi') load(); }, [tab, from, to]);
  useEffect(() => { get('/teams').then(setTeams).catch(() => {}); }, []);
  const teamName = (id) => teams.find((x) => x._id === id)?.label || '—';

  async function save() {
    try {
      const url = tab === 'loads' ? `/section-loads/${edit.id}` : `/unloadings/${edit.id}`;
      const body = tab === 'loads'
        ? { count: Number(edit.count), date: edit.date }
        : { awwal: Number(edit.awwal || 0), doem: Number(edit.doem || 0), khangar: Number(edit.khangar || 0), broken: Number(edit.broken || 0), date: edit.date };
      await put(url, body);
      setEdit(null); setMsg({ text: t.savedOk, bad: false }); load();
    } catch (e) { setMsg({ text: e.message, bad: true }); }
  }
  async function erase(r) {
    if (!window.confirm(`${t.confirmDelete}: ${where(r, t)} — ${new Date(r.date).toLocaleDateString()}?`)) return;
    try {
      await del(tab === 'loads' ? `/section-loads/${r._id}` : `/unloadings/${r._id}`);
      setMsg({ text: t.deleted, bad: false }); load();
    } catch (e) { setMsg({ text: e.message, bad: true }); }
  }

  const shown = rows.filter((r) => !q || `${where(r, t)} ${teamName(r.teamId || r.nikasiTeamId)}`.toLowerCase().includes(q.toLowerCase()));
  const num = (k) => (
    <input inputMode="numeric" className={cx(tbl.cell, 'max-w-28')} value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value.replace(/[^\d]/g, '') })} />
  );

  const isList = tab === 'loads' || tab === 'nikasi';
  const heads = [t.date, `${t.line} / ${t.section}`, t.team, ...(tab === 'loads' ? [t.kachiBharai] : [t.awwal, t.doem, t.khangar, t.broken])];

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title={t.corrections} />
        <CardBody>
          <Muted>{t.correctionsHint}</Muted>
          {/* every entry of a day can also be corrected on Daily Entry */}
          <Link to="/daily" className="flex items-center justify-between gap-2 rounded-lg bg-brand-50 px-3 py-2.5 text-md font-semibold text-brand-800 no-underline ring-1 ring-brand-200 hover:bg-brand-100">
            <span>{t.dailyEntry}: {t.correctOnDaily}</span><span aria-hidden="true">›</span>
          </Link>
          {/* two rows of two on phones, one row on wider screens */}
          <Tabs size="sm" className="grid-cols-2! sm:grid-cols-4!" value={tab} onChange={setTab}
            options={[['loads', t.loadingBharai], ['nikasi', t.unloadingNikasi], ['moulding', t.moulding], ['firing', t.firing]]} />
          {isList && (
            <FormGrid className="lg:grid-cols-3">
              <Field label={t.fromDate}><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label={t.toDate}><Input type="date" value={to} min={from} max={daysAgo(0)} onChange={(e) => setTo(e.target.value)} /></Field>
              <Field label={t.name}><Input type="search" placeholder={t.typeToSearch} value={q} onChange={(e) => setQ(e.target.value)} /></Field>
            </FormGrid>
          )}
          {!isList && (
            <p className="m-0 text-center text-md text-n-700">
              {t.correctOnPage} <Link className="font-bold text-brand-700" to={tab === 'moulding' ? '/moulding' : '/firing'}>{tab === 'moulding' ? t.moulding : t.firing}</Link>
            </p>
          )}
          {msg.text && <Alert tone={msg.bad ? 'err' : 'ok'}>{msg.text}</Alert>}
        </CardBody>
      </Card>

      {isList && (
        <TableCard title={`${tab === 'loads' ? t.loadingBharai : t.unloadingNikasi} (${shown.length})`}>
          <table className={tbl.table}>
            <thead>
              <tr>
                {heads.map((h, i) => <th key={h} className={cx(i === 0 && 'sticky-col', tbl.th)}>{h}</th>)}
                <th className={cx('actions', tbl.th)}>{t.action}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const on = edit?.id === r._id;
                return (
                  <tr key={r._id} className={cx(tbl.tr, on && 'bg-amber-50!')}>
                    <td className={tbl.td}>{on ? <input type="date" className={tbl.cell} max={daysAgo(0)} value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /> : <DateTime value={r.date} />}</td>
                    <td className={tbl.td}>{where(r, t)}{r.round ? ` · ${t.round} ${r.round}` : ''}</td>
                    <td className={tbl.td}>{teamName(r.teamId || r.nikasiTeamId)}</td>
                    {tab === 'loads'
                      ? <td className={cx(tbl.td, 'font-bold')}>{on ? num('count') : (r.count || 0).toLocaleString()}</td>
                      : ['awwal', 'doem', 'khangar', 'broken'].map((k) => <td key={k} className={tbl.td}>{on ? num(k) : (r[k] || 0).toLocaleString()}</td>)}
                    <td className={cx('actions', tbl.td)}>
                      <div className="inline-flex gap-1.5">
                        {on ? (
                          <>
                            <IconBtn kind="save" title={t.save} onClick={save} />
                            <IconBtn kind="cancel" title={t.cancel} onClick={() => setEdit(null)} />
                          </>
                        ) : (
                          <>
                            <IconBtn kind="edit" title={t.edit} onClick={() => setEdit({
                              id: r._id, date: iso(new Date(r.date)),
                              ...(tab === 'loads' ? { count: String(r.count) } : { awwal: String(r.awwal), doem: String(r.doem), khangar: String(r.khangar), broken: String(r.broken) }),
                            })} />
                            <IconBtn kind="delete" title={t.delete} onClick={() => erase(r)} />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!shown.length && <Empty cols={heads.length + 1}>{t.noEntries}</Empty>}
            </tbody>
          </table>
        </TableCard>
      )}
    </div>
  );
}
