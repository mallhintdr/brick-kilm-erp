import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, post, put, del, uuid } from '../api.js';
import { Card, CardHeader, CardBody, Field, Input, Select, FormGrid, Button, Alert, Muted, Sheet, TableCard, tbl, cx } from '../components/ui.jsx';
import { Plus } from 'lucide-react';

const ROLES = ['owner', 'accountant', 'munshi', 'mistri', 'viewer'];
const MODULES = ['workers', 'peshgi', 'settings', 'types'];
const ACTIONS = ['view', 'add', 'edit', 'delete'];

function PermissionMatrix({ user, t, onClose, onChanged }) {
  const [matrix, setMatrix] = useState(null);
  const [msg, setMsg] = useState({ text: '', bad: false });

  const load = () => get(`/users/${user._id}/permissions`).then(setMatrix).catch(() => {});
  useEffect(() => { load(); }, [user._id]);

  async function toggle(module, action, current) {
    try {
      await put(`/users/${user._id}/permissions`, { module, [action]: !current });
      setMsg({ text: t.savedOk, bad: false });
      load();
      onChanged?.();
    } catch (e) { setMsg({ text: e.message, bad: true }); }
  }

  async function resetModule(module) {
    try {
      await del(`/users/${user._id}/permissions/${module}`);
      setMsg({ text: `${t.resetDefault}: ${module}`, bad: false });
      load();
      onChanged?.();
    } catch (e) { setMsg({ text: e.message, bad: true }); }
  }

  if (!matrix) return null;
  const isOwnerUser = matrix.role === 'owner';

  return (
    <Sheet title={`${t.permissions}: ${user.username} (${user.role})`} onClose={onClose} footer={<Button block onClick={onClose}>{t.close}</Button>}>
      {isOwnerUser && <Muted>{t.ownerAlwaysFull}</Muted>}
      {!isOwnerUser && (
        <div className="table-wrap overflow-x-auto rounded-lg ring-1 ring-n-200">
          <table className={tbl.table}>
            <thead><tr><th className={tbl.th}>{t.module}</th>{ACTIONS.map((a) => <th key={a} className={tbl.th}>{t[a]}</th>)}<th className={tbl.th} /></tr></thead>
            <tbody>
              {MODULES.map((m) => {
                const cell = matrix.modules[m];
                return (
                  <tr key={m} className={tbl.tr}>
                    <td className={cx(tbl.td, 'font-semibold')}>{t[m]}</td>
                    {ACTIONS.map((a) => (
                      <td key={a} className={tbl.td}>
                        <input type="checkbox" className="size-5 min-h-0 accent-brand-600" checked={!!cell.effective[a]} onChange={() => toggle(m, a, cell.effective[a])}
                          title={cell.overridden[a] ? t.customOverride : t.roleDefault} />
                        {cell.overridden[a] && <span className="text-xs text-brand-700"> *</span>}
                      </td>
                    ))}
                    <td className={tbl.td}><Button size="sm" variant="secondary" onClick={() => resetModule(m)}>{t.resetDefault}</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {msg.text && <Alert tone={msg.bad ? 'err' : 'ok'}>{msg.text}</Alert>}
      <Muted className="text-xs">* {t.customOverride}</Muted>
    </Sheet>
  );
}

export default function Users() {
  const t = useT();
  const [users, setUsers] = useState([]);
  const [f, setF] = useState({ username: '', password: '', role: 'munshi' });
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState({ text: '', bad: false });

  const load = () => get('/users').then(setUsers).catch(() => {});
  useEffect(() => { load(); }, []);

  async function addUser(e) {
    e.preventDefault();
    try {
      await post('/users', { ...f, clientUuid: uuid() });
      setMsg({ text: t.savedOk, bad: false });
      setF({ username: '', password: '', role: 'munshi' });
      load();
    } catch (e2) { setMsg({ text: e2.message, bad: true }); }
  }

  async function changeRole(id, role) {
    try {
      await put(`/users/${id}/role`, { role });
      load();
    } catch (e) { setMsg({ text: e.message, bad: true }); }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title={t.newUser} />
        <form onSubmit={addUser}>
          <CardBody>
            <FormGrid className="lg:grid-cols-3">
              <Field label={t.username}><Input required autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
              <Field label={t.password}><Input required type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
              <Field label={t.roleLabel}>
                <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</Select>
              </Field>
            </FormGrid>
            <Button type="submit" className="justify-self-center sm:min-w-40"><Plus className="size-4 shrink-0" aria-hidden="true" /> {t.add}</Button>
            {msg.text && <Alert tone={msg.bad ? 'err' : 'ok'}>{msg.text}</Alert>}
          </CardBody>
        </form>
      </Card>

      <TableCard title={`${t.users} (${users.length})`}>
        <table className={tbl.table}>
          <thead><tr>
            <th className={cx('rownum', tbl.th)}>#</th><th className={cx('sticky-col', tbl.th)}>{t.username}</th>
            <th className={tbl.th}>{t.roleLabel}</th><th className={cx('actions', tbl.th)}>{t.action}</th>
          </tr></thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u._id} className={tbl.tr}>
                <td className={cx('rownum', tbl.td, 'text-n-500')}>{i + 1}</td>
                <td className={cx(tbl.td, 'font-semibold')}>{u.username}</td>
                <td className={tbl.td}>
                  <select className={cx(tbl.cell, 'max-w-40')} value={u.role} disabled={u.role === 'owner'} onChange={(e) => changeRole(u._id, e.target.value)}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className={cx('actions', tbl.td)}><Button size="sm" variant="secondary" onClick={() => setEditing(u)}>{t.permissions}</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      {editing && <PermissionMatrix user={editing} t={t} onClose={() => setEditing(null)} onChanged={load} />}
    </div>
  );
}
