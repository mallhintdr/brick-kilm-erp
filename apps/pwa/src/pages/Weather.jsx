import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT, useLang } from '../i18n.js';
import { get, getRole, fmtDateTime } from '../api.js';
import { Card, CardBody, Alert, Tabs, Badge, IconButton, TableCard, tbl, cx } from '../components/ui.jsx';

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
const rainCls = (p) => (p >= 50 ? 'text-loss' : p >= 30 ? 'text-caution' : '');
const LVL = { green: 'ring-green-300 bg-green-50/60', amber: 'ring-amber-300 bg-amber-50/60', red: 'ring-red-300 bg-red-50/60' };
const ADV = { green: 'bg-green-100 text-green-800', amber: 'bg-amber-100 text-amber-800', red: 'bg-red-100 text-red-800' };
const CONF = { high: 'ok', medium: 'brand', low: 'neutral' };

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
      <Card>
        <CardBody>
          <h2 className="m-0 text-lg font-bold">{t.weather}</h2>
          <Alert tone="err">{err}</Alert>
          {getRole() === 'owner' && (
            <Link to="/settings" className="mx-auto inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 font-semibold text-white no-underline hover:bg-brand-700">{t.setKilnLocation}</Link>
          )}
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardBody>
          <div className="flex items-center gap-2">
            <h2 className="m-0 min-w-0 flex-1 text-lg font-bold text-n-900">{t.weather}{wx?.place ? ` — ${wx.place}` : ''}</h2>
            <IconButton label={t.wxRefresh} disabled={busy} onClick={() => load(true)} className="size-9 rounded-full bg-green-50 text-green-700 ring-1 ring-green-300 hover:bg-green-100">
              <svg className={busy ? 'animate-spin' : undefined} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
              </svg>
            </IconButton>
          </div>
          <Tabs options={RANGES.map((r) => [r, r === 1 ? t.wxToday : `${r} ${t.wxDays}`])} value={range} onChange={setRange} />
          {wx && (
            <p className="m-0 text-center text-xs text-n-500">
              {t.wxUpdated}: {fmtDateTime(wx.updatedAt)}{wx.stale ? ` — ${t.wxStale}` : ''} · {t.wxSource}: {wx.source}
            </p>
          )}
          {busy && !wx && <p className="m-0 text-center text-n-500">…</p>}
        </CardBody>
      </Card>

      {/* Today: advice first, then the next 24 hours */}
      {wx && range === 1 && today && (
        <>
          <DayCard d={today} t={t} name={t.wxToday} big />
          <TableCard title={t.wxNext24}>
            <table className={tbl.table}>
              <thead><tr>{[t.wxTime, t.wxSky, '°C', t.wxRainChance, t.wxRainMm, t.wxHumidity, t.wxWindKmh].map((h, i) => <th key={i} className={cx(i === 0 && 'sticky-col', tbl.th)}>{h}</th>)}</tr></thead>
              <tbody>
                {wx.hours.map((h) => {
                  const [icon, key] = WX(h.code);
                  return (
                    <tr key={h.time} className={cx(tbl.tr, h.rainChance >= 50 && 'bg-red-50!')}>
                      <td className={cx(tbl.td, 'font-bold')}>{h.time.slice(11, 16)}</td>
                      <td className={tbl.td} title={t[key]}>{icon}</td>
                      <td className={tbl.td}>{n0(h.temp)}</td>
                      <td className={cx(tbl.td, 'font-bold', rainCls(h.rainChance))}>{n0(h.rainChance)}%</td>
                      <td className={tbl.td}>{h.rainMm ? h.rainMm.toFixed(1) : '0'}</td>
                      <td className={tbl.td}>{n0(h.humidity)}%</td>
                      <td className={tbl.td}>{n0(h.windKmh)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableCard>
        </>
      )}

      {/* 3, 7 or 15 days: one card per day */}
      {wx && range > 1 && (
        <>
          {range === 15 && <p className="m-0 rounded-md bg-amber-50 px-3 py-2 text-center text-sm text-amber-800">{t.wxLongRangeNote}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
    <div className={cx('grid gap-2 rounded-lg bg-white p-3.5 ring-1', LVL[d.advice.level] || 'ring-n-200')}>
      <div className="flex items-center justify-between gap-2">
        <strong className="text-base text-n-900">{name}</strong>
        <Badge tone={CONF[d.confidence]}>{t[`wxConf_${d.confidence}`]}</Badge>
      </div>
      <div className="flex items-center justify-center gap-3">
        <span className={big ? 'text-5xl' : 'text-4xl'} title={t[key]}>{icon}</span>
        <span className="text-lg text-n-600"><b className="text-2xl text-n-900">{n0(d.tMax)}°</b> / {n0(d.tMin)}°</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-n-600">
        <span>{t.wxRainChance}: <b className={rainCls(d.rainChance)}>{n0(d.rainChance)}%</b></span>
        <span>{t.wxRainMm}: <b>{d.rainMm != null ? d.rainMm.toFixed(1) : '—'}</b></span>
        <span>{t.wxHumidity}: <b>{n0(d.humidity)}%</b></span>
        <span>{t.wxWindKmh}: <b>{n0(d.windKmh)}</b>{d.gustKmh ? ` (${t.wxGust} ${n0(d.gustKmh)})` : ''}</span>
      </div>
      <ul className="m-0 grid list-none gap-1 p-0">
        {d.advice.notes.map((nt) => <li key={nt.key} className={cx('rounded-md px-2.5 py-1.5 text-sm font-semibold', ADV[nt.level])}>{t[nt.key]}</li>)}
      </ul>
    </div>
  );
}
