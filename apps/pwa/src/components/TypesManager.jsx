import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, post, put, del, uuid } from '../api.js';
import { Card, CardHeader, CardBody, Field, Input, FormGrid, Button, Alert, Muted, Tabs, Badge, tbl, cx } from './ui.jsx';
import { Plus } from 'lucide-react';

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
    <Card>
      <CardHeader title={t.typesTitle} />
      <CardBody>
        <Muted>{t.typesNote}</Muted>
        <Tabs size="sm" options={KINDS.map((k) => [k, t.kinds[k]])} value={kind} onChange={setKind} className="grid-cols-2! sm:grid-cols-4!" />

        {isOwner && (
          <form onSubmit={create} className="grid gap-3">
            <FormGrid className="lg:grid-cols-3">
              <Field label={t.labelEn}><Input required value={add.label} onChange={(e) => setAdd({ ...add, label: e.target.value })} /></Field>
              <Field label={t.labelUr}><Input dir="rtl" value={add.labelUr} onChange={(e) => setAdd({ ...add, labelUr: e.target.value })} /></Field>
              <Field label={t.typeKey}><Input value={add.key} placeholder="auto" onChange={(e) => setAdd({ ...add, key: e.target.value })} /></Field>
            </FormGrid>
            <Button type="submit" className="justify-self-center sm:min-w-40"><Plus className="size-4 shrink-0" aria-hidden="true" /> {t.add}</Button>
          </form>
        )}

        {msg.text && <Alert tone={msg.bad ? 'err' : 'ok'}>{msg.text}</Alert>}

        <div className="table-wrap overflow-x-auto rounded-lg ring-1 ring-n-200">
          <table className={tbl.table}>
            <thead>
              <tr>
                {['#', t.labelEn, t.labelUr, t.typeKey, t.status].map((h, i) => <th key={i} className={cx(i === 0 && 'rownum', tbl.th)}>{h}</th>)}
                {isOwner && <th className={tbl.th}>{t.action}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const editing = edit?.id === r._id;
                return (
                  <tr key={r._id} className={tbl.tr}>
                    <td className={cx('rownum', tbl.td, 'text-n-500')}>{i + 1}</td>
                    <td className={tbl.td}>{editing ? <input className={tbl.cell} value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /> : r.label}</td>
                    <td className={tbl.td}>{editing ? <input className={tbl.cell} dir="rtl" value={edit.labelUr} onChange={(e) => setEdit({ ...edit, labelUr: e.target.value })} /> : r.labelUr}</td>
                    <td className={tbl.td}><code className="text-xs text-n-600">{r.key}</code>{r.builtin && <span className="text-xs text-n-400"> · {t.builtin}</span>}</td>
                    <td className={tbl.td}><Badge tone={r.active ? 'ok' : 'warn'}>{r.active ? t.active : t.inactive}</Badge></td>
                    {isOwner && (
                      <td className={cx(tbl.td, 'whitespace-nowrap')}>
                        <div className="inline-flex flex-wrap justify-center gap-1.5">
                          {editing ? (
                            <>
                              <Button size="sm" onClick={saveEdit}>{t.save}</Button>
                              <Button size="sm" variant="secondary" onClick={() => setEdit(null)}>{t.cancel}</Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="secondary" onClick={() => setEdit({ id: r._id, label: r.label, labelUr: r.labelUr || '' })}>{t.edit}</Button>
                              {!r.builtin && (
                                <Button size="sm" variant="secondary" onClick={() => run(() => put(`/types/${r._id}`, { active: !r.active }))}>
                                  {r.active ? t.deactivate : t.activate}
                                </Button>
                              )}
                              <Button size="sm" variant="dangerGhost" disabled={r.builtin} title={r.builtin ? t.builtinNoDelete : ''} onClick={() => remove(r)}>{t.delete}</Button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
