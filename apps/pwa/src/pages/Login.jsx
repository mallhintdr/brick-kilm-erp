import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT, useLang } from '../i18n.js';
import { post, setSession } from '../api.js';
import KilnLogo from '../components/KilnLogo.jsx';
import { Card, Field, Input, Button, Alert } from '../components/ui.jsx';

export default function Login() {
  const t = useT();
  const { lang, setLang } = useLang();
  const nav = useNavigate();
  const [f, setF] = useState({ username: '', password: '', tenantCode: '' });
  const [needsCode, setNeedsCode] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const r = await post('/auth/login', f);
      if (r.queued) throw new Error('Server unreachable — check the API is running and try again');
      setSession(r.token, r.role, r.username || f.username, r.kilnCode);
      nav('/home', { replace: true });
    } catch (e2) {
      if (e2.status === 409) setNeedsCode(true);
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-n-50 px-4 py-8">
      <Card className="w-full max-w-sm overflow-hidden">
        <div className="grid place-items-center gap-2 bg-gradient-to-br from-slate-900 to-slate-800 px-6 py-7 text-center">
          <div className="grid size-14 place-items-center rounded-xl bg-brand-600 shadow-lg">
            <KilnLogo size={34} color="#ffffff" />
          </div>
          <h1 className="m-0 text-xl font-bold text-white">{t.appName}</h1>
          <p className="m-0 text-xs text-slate-400">Brick Kiln Operations</p>
        </div>
        <form className="grid gap-3.5 p-5" onSubmit={submit}>
          <Field label={t.username}>
            <Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder="owner / munshi" autoFocus required autoCapitalize="none" autoCorrect="off" />
          </Field>
          <Field label={t.password}>
            <Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="••••••••" required />
          </Field>
          {needsCode && (
            <Field label={t.kilnCode}>
              <Input value={f.tenantCode} onChange={(e) => setF({ ...f, tenantCode: e.target.value })} placeholder={t.kilnCodeHint || 'e.g. SAD208'} autoFocus required autoCapitalize="characters" />
            </Field>
          )}
          {err && <Alert tone="err">{err}</Alert>}
          <Button type="submit" block loading={loading} className="mt-1">{t.login}</Button>
          <Button variant="secondary" block onClick={() => setLang(lang === 'ur' ? 'en' : 'ur')}>🌐 {t.lang}</Button>
          <p className="m-0 text-center text-xs text-n-400">v{__APP_VERSION__}</p>
        </form>
      </Card>
    </div>
  );
}
