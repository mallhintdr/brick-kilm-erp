import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, post, put, del, uuid } from '../api.js';

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
      setMsg({ text: t.resetDefault + ': ' + module, bad: false });
      load();
      onChanged?.();
    } catch (e) { setMsg({ text: e.message, bad: true }); }
  }

  if (!matrix) return null;
  const isOwnerUser = matrix.role === 'owner';

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={t.permissions} onClick={(e) => e.stopPropagation()} style={{ position: 'static', borderRadius: 'var(--radius)', maxWidth: 560, margin: '10vh auto', padding: '1.1rem' }}>
        <h2>{t.permissions}: {user.username} ({t.roleLabel}: {user.role})</h2>
        {isOwnerUser && <p className="muted">{t.ownerAlwaysFull}</p>}
        {!isOwnerUser && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t.module}</th>{ACTIONS.map((a) => <th key={a}>{t[a]}</th>)}<th /></tr></thead>
              <tbody>
                {MODULES.map((m) => {
                  const cell = matrix.modules[m];
                  return (
                    <tr key={m}>
                      <td>{t[m]}</td>
                      {ACTIONS.map((a) => (
                        <td key={a}>
                          <input
                            type="checkbox" style={{ minHeight: 'auto', width: 'auto' }}
                            checked={!!cell.effective[a]} onChange={() => toggle(m, a, cell.effective[a])}
                            title={cell.overridden[a] ? t.customOverride : t.roleDefault}
                          />
                          {cell.overridden[a] && <span className="muted" style={{ fontSize: '.7em' }}> *</span>}
                        </td>
                      ))}
                      <td><button className="ghost" onClick={() => resetModule(m)}>{t.resetDefault}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>{msg.text}</p>}
        <p className="muted" style={{ fontSize: '.8em' }}>* {t.customOverride}</p>
        <button className="primary" onClick={onClose}>{t.close}</button>
      </div>
    </div>
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
    <div className="grid">
      <form className="card grid" onSubmit={addUser}>
        <h2>{t.newUser}</h2>
        <label>{t.username}<input required value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></label>
        <label>{t.password}<input required type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
        <label>{t.roleLabel}
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <button className="primary">{t.add}</button>
        {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>{msg.text}</p>}
      </form>

      <div className="card table-wrap">
        <table>
          <thead><tr><th className="rownum">#</th><th className="sticky-col">{t.username}</th><th>{t.roleLabel}</th><th className="actions">{t.action}</th></tr></thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u._id}>
                <td className="rownum">{i + 1}</td>
                <td>{u.username}</td>
                <td>
                  <select value={u.role} disabled={u.role === 'owner'} onChange={(e) => changeRole(u._id, e.target.value)}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="actions"><button className="ghost" onClick={() => setEditing(u)}>{t.permissions}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <PermissionMatrix user={editing} t={t} onClose={() => setEditing(null)} onChanged={load} />}
    </div>
  );
}
