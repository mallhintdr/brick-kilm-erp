import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, post, put, del, uuid } from '../api.js';

const KINDS = ['workerCategory', 'procurementItem', 'customerType', 'paymentMode'];

export default function TypesManager({ isOwner }) {
  const t = useT();
  const [kind, setKind] = useState(KINDS[0]);
  const [rows, setRows] = useState([]);
  const [add, setAdd] = useState({ label: '', labelUr: '', key: '' });
  const [edit, setEdit] = useState(null); // { id, label, labelUr }
  const [msg, setMsg] = useState({ text: '', bad: false });

  const load = () => get(`/types?kind=${kind}`).then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); setEdit(null); setMsg({ text: '', bad: false }); }, [kind]);

  const run = async (fn, okText = t.savedOk) => {
    try { await fn(); setMsg({ text: okText, bad: false }); await load(); } catch (e) { setMsg({ text: e.message, bad: true }); }
  };

  const create = (e) => {
    e.preventDefault();
    run(async () => {
      const body = { kind, label: add.label.trim(), labelUr: add.labelUr.trim() || undefined };
      if (add.key.trim()) body.key = add.key.trim();
      await post('/types', { ...body, clientUuid: uuid() });
      setAdd({ label: '', labelUr: '', key: '' });
    });
  };

  const saveEdit = () => run(async () => {
    await put(`/types/${edit.id}`, { label: edit.label, labelUr: edit.labelUr });
    setEdit(null);
  });

  const remove = (r) => {
    if (!window.confirm(`${t.confirmDelete}: ${r.label}?`)) return;
    run(() => del(`/types/${r._id}`), t.deleted);
  };

  return (
    <div className="card grid">
      <h2>{t.typesTitle}</h2>
      <p className="muted">{t.typesNote}</p>

      <div className="row" style={{ flexWrap: 'wrap' }}>
        {KINDS.map((k) => (
          <button key={k} className={k === kind ? 'primary' : 'ghost'} onClick={() => setKind(k)}>{t.kinds[k]}</button>
        ))}
      </div>

      {isOwner && (
        <form className="grid" onSubmit={create}>
          <label>{t.labelEn}<input required value={add.label} onChange={(e) => setAdd({ ...add, label: e.target.value })} /></label>
          <label>{t.labelUr}<input dir="rtl" value={add.labelUr} onChange={(e) => setAdd({ ...add, labelUr: e.target.value })} /></label>
          <label>{t.typeKey}<input value={add.key} placeholder="auto" onChange={(e) => setAdd({ ...add, key: e.target.value })} /></label>
          <button className="primary">{t.add}</button>
        </form>
      )}

      {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>{msg.text}</p>}

      <div className="table-wrap" style={{ margin: '0 -1.1rem -1.1rem' }}>
        <table>
          <thead>
            <tr><th className="rownum">#</th><th>{t.labelEn}</th><th>{t.labelUr}</th><th>{t.typeKey}</th><th>{t.status}</th>{isOwner && <th />}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const editing = edit?.id === r._id;
              return (
                <tr key={r._id}>
                  <td className="rownum">{i + 1}</td>
                  <td>{editing ? <input value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /> : r.label}</td>
                  <td>{editing ? <input dir="rtl" value={edit.labelUr} onChange={(e) => setEdit({ ...edit, labelUr: e.target.value })} /> : r.labelUr}</td>
                  <td><code>{r.key}</code>{r.builtin && <span className="muted"> · {t.builtin}</span>}</td>
                  <td className={r.active ? 'ok' : 'warn'}>{r.active ? t.active : t.inactive}</td>
                  {isOwner && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {editing ? (
                        <>
                          <button className="primary" onClick={saveEdit}>{t.save}</button>
                          <button className="ghost" onClick={() => setEdit(null)}>{t.cancel}</button>
                        </>
                      ) : (
                        <>
                          <button className="ghost" onClick={() => setEdit({ id: r._id, label: r.label, labelUr: r.labelUr || '' })}>{t.edit}</button>
                          {!r.builtin && (
                            <button className="ghost" onClick={() => run(() => put(`/types/${r._id}`, { active: !r.active }))}>
                              {r.active ? t.deactivate : t.activate}
                            </button>
                          )}
                          <button className="ghost danger" disabled={r.builtin} title={r.builtin ? t.builtinNoDelete : ''} onClick={() => remove(r)}>{t.delete}</button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
