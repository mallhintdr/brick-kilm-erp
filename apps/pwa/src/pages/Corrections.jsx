import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n.js';
import { get, put, del } from '../api.js';
import DateTime from '../components/DateTime.jsx';
import { IconBtn } from '../components/RowActions.jsx';

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
    <input inputMode="numeric" className="cell-input" value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value.replace(/[^\d]/g, '') })} />
  );

  return (
    <div className="grid">
      <div className="card grid">
        <h2>{t.corrections}</h2>
        <p className="muted" style={{ margin: 0, textAlign: 'center' }}>{t.correctionsHint}</p>
        <div className="wx-tabs corr-tabs" role="tablist">
          {[['loads', t.loadingBharai], ['nikasi', t.unloadingNikasi], ['moulding', t.moulding], ['firing', t.firing]].map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        {(tab === 'loads' || tab === 'nikasi') && (
          <div className="grid two">
            <label>{t.fromDate}<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>{t.toDate}<input type="date" value={to} min={from} max={daysAgo(0)} onChange={(e) => setTo(e.target.value)} /></label>
            <label>{t.name}<input type="search" placeholder={t.typeToSearch} value={q} onChange={(e) => setQ(e.target.value)} /></label>
          </div>
        )}
        {(tab === 'moulding' || tab === 'firing') && (
          <p style={{ margin: 0, textAlign: 'center' }}>
            {t.correctOnPage} <Link to={tab === 'moulding' ? '/moulding' : '/firing'}><strong>{tab === 'moulding' ? t.moulding : t.firing}</strong></Link>
          </p>
        )}
        {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>{msg.text}</p>}
      </div>

      {(tab === 'loads' || tab === 'nikasi') && (
        <div className="card table-wrap">
          <h2>{tab === 'loads' ? t.loadingBharai : t.unloadingNikasi} ({shown.length})</h2>
          <table>
            <thead>
              <tr>
                <th className="sticky-col">{t.date}</th>
                <th>{t.line} / {t.section}</th>
                <th>{t.team}</th>
                {tab === 'loads' ? <th>{t.kachiBharai}</th> : (<><th>{t.awwal}</th><th>{t.doem}</th><th>{t.khangar}</th><th>{t.broken}</th></>)}
                <th className="actions">{t.action}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const on = edit?.id === r._id;
                return (
                  <tr key={r._id}>
                    <td>{on ? <input type="date" className="cell-input" max={daysAgo(0)} value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /> : <DateTime value={r.date} />}</td>
                    <td>{where(r, t)}{r.round ? ` · ${t.round} ${r.round}` : ''}</td>
                    <td>{teamName(r.teamId || r.nikasiTeamId)}</td>
                    {tab === 'loads'
                      ? <td>{on ? num('count') : <strong>{(r.count || 0).toLocaleString()}</strong>}</td>
                      : ['awwal', 'doem', 'khangar', 'broken'].map((k) => <td key={k}>{on ? num(k) : (r[k] || 0).toLocaleString()}</td>)}
                    <td className="actions">
                      <div className="row-actions">
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
              {!shown.length && <tr><td colSpan={tab === 'loads' ? 5 : 8} className="muted">{t.noEntries}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
