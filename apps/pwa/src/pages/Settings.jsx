import { useEffect, useState } from 'react';
import { useT } from '../i18n.js';
import { get, put, getRole } from '../api.js';
import TypesManager from '../components/TypesManager.jsx';
import DeleteButton from '../components/DeleteButton.jsx';

const KEYS = [
  'peshgiLimit', 'munshiAdvanceLimit', 'recoveryPct', 'kharchiFloor',
  'ratePathera', 'cutPathera', 'rateBharai', 'cutBharai', 'rateNikasi', 'cutNikasi',
  'rateJalai', 'priceAwwal', 'priceDoem', 'priceKhangar',
];

export default function Settings() {
  const t = useT();
  const isOwner = getRole() === 'owner';
  const [vals, setVals] = useState({});
  const [msg, setMsg] = useState({ text: '', bad: false });

  useEffect(() => { get('/settings').then(setVals).catch(() => {}); }, []);

  async function save(key, value = vals[key]) {
    try {
      await put('/settings', { key, value });
      setVals((v) => ({ ...v, [key]: value }));
      setMsg({ text: t.savedOk, bad: false });
    } catch (e) { setMsg({ text: e.message, bad: true }); }
  }

  return (
    <>
      <div className="card grid">
        <p className="muted">{t.limitNote}</p>
        {KEYS.map((k) => (
          <div className="row" key={k}>
            <label className="grow">{t[k]}
              <input inputMode="decimal" disabled={!isOwner} value={vals[k] ?? ''} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
            </label>
            {isOwner && <button className="primary" onClick={() => save(k)}>{t.save}</button>}
            {isOwner && (
              <DeleteButton
                path={`/settings/${k}`} name={t[k]} label={t.resetDefault}
                onDone={() => { setMsg({ text: t.savedOk, bad: false }); get('/settings').then(setVals).catch(() => {}); }}
                onError={(m) => setMsg({ text: m, bad: true })}
              />
            )}
          </div>
        ))}
        <label className="row" style={{ alignItems: 'center' }}>
          <input
            type="checkbox" disabled={!isOwner} style={{ minHeight: 'auto', width: 'auto' }}
            checked={vals.allowNegativeStock === '1'}
            onChange={(e) => save('allowNegativeStock', e.target.checked ? '1' : '0')}
          />
          {t.allowNegativeStock}
        </label>
        {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>{msg.text}</p>}
      </div>

      <KilnLocation t={t} isOwner={isOwner} vals={vals} onSaved={(v) => setVals((x) => ({ ...x, ...v }))} />
      <TypesManager isOwner={isOwner} />
    </>
  );
}

// Owner sets where the kiln is (for the weather advisory): GPS from the phone, or typed coordinates.
function KilnLocation({ t, isOwner, vals, onSaved }) {
  const [loc, setLoc] = useState({ kilnLat: '', kilnLon: '', kilnPlace: '' });
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => { setLoc({ kilnLat: vals.kilnLat || '', kilnLon: vals.kilnLon || '', kilnPlace: vals.kilnPlace || '' }); }, [vals.kilnLat, vals.kilnLon, vals.kilnPlace]);

  async function save(next = loc) {
    const lat = Number(next.kilnLat); const lon = Number(next.kilnLon);
    if (!(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180) || next.kilnLat === '' || next.kilnLon === '') {
      setMsg({ text: t.locInvalid, bad: true }); return;
    }
    setBusy(true);
    try {
      for (const k of ['kilnLat', 'kilnLon', 'kilnPlace']) await put('/settings', { key: k, value: String(next[k] ?? '') });
      onSaved(next);
      setMsg({ text: t.savedOk, bad: false });
    } catch (e) { setMsg({ text: e.message, bad: true }); }
    setBusy(false);
  }

  function useGps() {
    if (!navigator.geolocation) { setMsg({ text: t.locNoGps, bad: true }); return; }
    setBusy(true); setMsg({ text: t.locFinding, bad: false });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const next = { ...loc, kilnLat: p.coords.latitude.toFixed(5), kilnLon: p.coords.longitude.toFixed(5) };
        setLoc(next);
        save(next); // saved straight away
      },
      (e) => { setBusy(false); setMsg({ text: `${t.locNoGps} (${e.message})`, bad: true }); },
      { enableHighAccuracy: true, timeout: 20000 },
    );
  }

  const set = Boolean(vals.kilnLat && vals.kilnLon);
  return (
    <div className="card grid">
      <h2>{t.kilnLocation}</h2>
      <p className="muted" style={{ margin: 0 }}>{t.kilnLocationHint}</p>
      <div className="grid two">
        <label>{t.locPlace}<input disabled={!isOwner} value={loc.kilnPlace} placeholder="e.g. Sadiqabad" onChange={(e) => setLoc({ ...loc, kilnPlace: e.target.value })} /></label>
        <label>{t.locLat}<input disabled={!isOwner} inputMode="decimal" value={loc.kilnLat} placeholder="28.30000" onChange={(e) => setLoc({ ...loc, kilnLat: e.target.value })} /></label>
        <label>{t.locLon}<input disabled={!isOwner} inputMode="decimal" value={loc.kilnLon} placeholder="70.13000" onChange={(e) => setLoc({ ...loc, kilnLon: e.target.value })} /></label>
      </div>
      {isOwner && (
        <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button type="button" className="primary" disabled={busy} onClick={useGps}>📍 {t.locUseGps}</button>
          <button type="button" className="ghost" disabled={busy} onClick={() => save()}>{t.save}</button>
          {set && <a className="ghost button-link" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${vals.kilnLat},${vals.kilnLon}`}>{t.locOnMap}</a>}
        </div>
      )}
      {msg.text && <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'err' : 'ok'}>{msg.text}</p>}
    </div>
  );
}
