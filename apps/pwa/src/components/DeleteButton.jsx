import { useT } from '../i18n.js';
import { del, getRole } from '../api.js';

// Owner-only. Asks for confirmation, calls DELETE, then lets the page reload / show the result.
export default function DeleteButton({ path, name, onDone, onError, label }) {
  const t = useT();
  if (getRole() !== 'owner') return null;

  async function run() {
    if (!window.confirm(`${t.confirmDelete}: ${name}?`)) return;
    try {
      onDone?.(await del(path));
    } catch (e) {
      onError?.(e.message);
    }
  }
  return <button className="ghost danger" onClick={run}>{label || t.delete}</button>;
}
