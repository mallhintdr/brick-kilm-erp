import Dexie from 'dexie';

const db = new Dexie('kiln');
db.version(1).stores({ outbox: '++id, clientUuid' });

const listeners = new Set();
export const onOutboxChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const notify = () => listeners.forEach((fn) => fn());

export const getToken = () => localStorage.getItem('token');
export const getRole = () => localStorage.getItem('role');
export const getUsername = () => localStorage.getItem('username') || localStorage.getItem('role') || 'User';
export const setSession = (token, role, username) => {
  localStorage.setItem('token', token);
  localStorage.setItem('role', role);
  if (username) localStorage.setItem('username', username);
};
export const clearSession = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  localStorage.removeItem('username');
};

async function raw(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(getToken() ? { authorization: `Bearer ${getToken()}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status });
  return data;
}

export const get = (path) => raw('GET', path);
export const put = (path, body) => raw('PUT', path, body);
export const del = (path) => raw('DELETE', path);

// Writes carry a clientUuid, so they are safe to queue offline and replay: the server rejects duplicates (409).
export async function post(path, body) {
  try {
    return await raw('POST', path, body);
  } catch (e) {
    if (e.status) throw e; // real server answer
    await db.outbox.add({ method: 'POST', path, body, clientUuid: body?.clientUuid });
    notify();
    return { queued: true };
  }
}

export async function flushOutbox() {
  let sent = 0;
  for (const item of await db.outbox.toArray()) {
    try {
      await raw(item.method, item.path, item.body);
    } catch (e) {
      if (!e.status) break; // still offline
      if (e.status === 401) break;
      // 409 = already posted, other 4xx = rejected by rules; drop so the queue never blocks
    }
    await db.outbox.delete(item.id);
    sent++;
  }
  if (sent) notify();
  return sent;
}

export const outboxCount = () => db.outbox.count();
export const uuid = () => crypto.randomUUID();

export const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const day = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const year = dt.getFullYear();
  return `${day}-${month}-${year}`;
};

export const fmtDateDM = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const day = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}`;
};

export const fmtDateSpan = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const day = dt.getDate();
  const month = dt.getMonth() + 1;
  const year = String(dt.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
};

export const fmtDateTime = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const day = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const year = dt.getFullYear();
  const hours = String(dt.getHours()).padStart(2, '0');
  const mins = String(dt.getMinutes()).padStart(2, '0');
  return `${day}-${month}-${year} ${hours}:${mins}`;
};

