import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT, useLang } from '../i18n.js';
import { get, getRole, fmtDateTime } from '../api.js';

// WMO weather codes -> icon + short label key
const WX = (code) => {
  if (code == null) return ['·', 'wxUnknown'];
  if (code === 0) return ['☀️', 'wxClear'];
  if (code <= 2) return ['🌤️', 'wxPartly'];
  if (code === 3) return ['☁️', 'wxCloudy'];
  if (code <= 48) return ['🌫️', 'wxFog'];
  if (code <= 57) return ['🌦️', 'wxDrizzle'];
  if (code <= 67 || (code >= 80 && code <= 82)) return ['🌧️', 'wxRain'];
  if (code <= 77 || code === 85 || code === 86) return ['🌨️', 'wxSnow'];
  if (code >= 95) return ['⛈️', 'wxStorm'];
  return ['☁️', 'wxCloudy'];
};
const RANGES = [1, 3, 7, 15];
const n0 = (v) => (v == null ? '—' : Math.round(v));

export default function Weather() {
  const t = useT();
  const { lang } = useLang();
  const [range, setRange] = useState(3);
  const [wx, setWx] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = (refresh) => {
    setBusy(true); setErr('');
    get(`/weather${refresh ? '?refresh=1' : ''}`).then(setWx).catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };
  useEffect(() => { load(false); }, []);

  const dayName = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-GB', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const days = wx?.days.slice(0, range) || [];
  const today = wx?.days[0];

  if (err) {
    return (
      <div className="grid">
        <div className="card grid">
          <h2>{t.weather}</h2>
          <p className="err" role="alert">{err}</p>
          {getRole() === 'owner' && <Link className="primary fit-center button-link" to="/settings">{t.setKilnLocation}</Link>}
        </div>
      </div>
    );
  }

  return (
    <div className="grid">
      <div className="card grid wx-head">
        <div className="wx-title">
          <h2>{t.weather}{wx?.place ? ` — ${wx.place}` : ''}</h2>
          <button type="button" className="wx-refresh" disabled={busy} onClick={() => load(true)} title={t.wxRefresh} aria-label={t.wxRefresh}>
            <svg className={busy ? 'spin' : undefined} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
            </svg>
          </button>
        </div>
        <div className="wx-tabs" role="tablist">
          {RANGES.map((r) => (
            <button key={r} type="button" role="tab" aria-selected={range === r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>
              {r === 1 ? t.wxToday : `${r} ${t.wxDays}`}
            </button>
          ))}
        </div>
        {wx && (
          <p className="muted wx-meta">
            {t.wxUpdated}: {fmtDateTime(wx.updatedAt)}{wx.stale ? ` — ${t.wxStale}` : ''} · {t.wxSource}: {wx.source}
          </p>
        )}
        {busy && !wx && <p className="muted">…</p>}
      </div>

      {/* Today: advice first, then the next 24 hours */}
      {wx && range === 1 && today && (
        <>
          <DayCard d={today} t={t} name={t.wxToday} big />
          <div className="card table-wrap">
            <h2>{t.wxNext24}</h2>
            <table>
              <thead><tr><th className="sticky-col">{t.wxTime}</th><th>{t.wxSky}</th><th>°C</th><th>{t.wxRainChance}</th><th>{t.wxRainMm}</th><th>{t.wxHumidity}</th><th>{t.wxWindKmh}</th></tr></thead>
              <tbody>
                {wx.hours.map((h) => {
                  const [icon, key] = WX(h.code);
                  return (
                    <tr key={h.time} className={h.rainChance >= 50 ? 'wx-rain-row' : undefined}>
                      <td><strong>{h.time.slice(11, 16)}</strong></td>
                      <td title={t[key]}>{icon}</td>
                      <td>{n0(h.temp)}</td>
                      <td><strong className={h.rainChance >= 50 ? 'err' : h.rainChance >= 30 ? 'warn' : ''}>{n0(h.rainChance)}%</strong></td>
                      <td>{h.rainMm ? h.rainMm.toFixed(1) : '0'}</td>
                      <td>{n0(h.humidity)}%</td>
                      <td>{n0(h.windKmh)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 3, 7 or 15 days: one card per day */}
      {wx && range > 1 && (
        <>
          {range === 15 && <p className="wx-note">{t.wxLongRangeNote}</p>}
          <div className="wx-days">
            {days.map((d, i) => <DayCard key={d.date} d={d} t={t} name={i === 0 ? t.wxToday : dayName(d.date)} />)}
          </div>
        </>
      )}
    </div>
  );
}

function DayCard({ d, t, name, big }) {
  const [icon, key] = WX(d.code);
  return (
    <div className={`card wx-day lvl-${d.advice.level}${big ? ' wx-big' : ''}`}>
      <div className="wx-day-head">
        <strong>{name}</strong>
        <span className={`wx-conf conf-${d.confidence}`}>{t[`wxConf_${d.confidence}`]}</span>
      </div>
      <div className="wx-day-main">
        <span className="wx-icon" title={t[key]}>{icon}</span>
        <span className="wx-temp"><b>{n0(d.tMax)}°</b> / {n0(d.tMin)}°</span>
      </div>
      <div className="wx-facts">
        <span>{t.wxRainChance}: <b className={d.rainChance >= 50 ? 'err' : d.rainChance >= 30 ? 'warn' : ''}>{n0(d.rainChance)}%</b></span>
        <span>{t.wxRainMm}: <b>{d.rainMm != null ? d.rainMm.toFixed(1) : '—'}</b></span>
        <span>{t.wxHumidity}: <b>{n0(d.humidity)}%</b></span>
        <span>{t.wxWindKmh}: <b>{n0(d.windKmh)}</b>{d.gustKmh ? ` (${t.wxGust} ${n0(d.gustKmh)})` : ''}</span>
      </div>
      <ul className="wx-advice">
        {d.advice.notes.map((nt) => <li key={nt.key} className={`adv-${nt.level}`}>{t[nt.key]}</li>)}
      </ul>
    </div>
  );
}
