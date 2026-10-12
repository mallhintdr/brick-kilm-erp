import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT, useLang } from '../i18n.js';
import { post, setSession } from '../api.js';

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
      setSession(r.token, r.role, f.username);
      nav('/kiln-board');
    } catch (e2) {
      if (e2.status === 409) setNeedsCode(true);
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrapper">
      <form className="card login" onSubmit={submit}>
        <div className="login-brand-header">
          <div className="login-brand-icon">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 20h16M7 20v-8l5-6 5 6v8M10 16h4M12 7V3" />
            </svg>
          </div>
          <h1>{t.appName}</h1>
          <p className="login-subtitle">Enterprise Kiln Operations & Field ERP</p>
        </div>

        <label>
          {t.username}
          <input
            value={f.username}
            onChange={(e) => setF({ ...f, username: e.target.value })}
            placeholder="e.g. owner or munshi"
            autoFocus
            required
          />
        </label>

        <label>
          {t.password}
          <input
            type="password"
            value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })}
            placeholder="••••••••"
            required
          />
        </label>

        {needsCode && (
          <label>
            {t.kilnCode}
            <input
              value={f.tenantCode}
              onChange={(e) => setF({ ...f, tenantCode: e.target.value })}
              placeholder={t.kilnCodeHint || 'e.g. SAD208'}
              autoFocus
              required
            />
          </label>
        )}

        {err && <p role="alert" className="err">{err}</p>}

        <button className="primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: '0.5rem' }}>
          {loading ? '...' : t.login}
        </button>

        <button
          type="button"
          className="ghost"
          style={{ width: '100%' }}
          onClick={() => setLang(lang === 'ur' ? 'en' : 'ur')}
        >
          🌐 {t.lang}
        </button>
      </form>
    </div>
  );
}
