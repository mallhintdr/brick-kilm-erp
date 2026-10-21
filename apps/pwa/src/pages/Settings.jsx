import { useEffect, useState } from 'react';
import { useT, useLang } from '../i18n.js';
import { get, put, getRole } from '../api.js';
import TypesManager from '../components/TypesManager.jsx';
import DeleteButton from '../components/DeleteButton.jsx';
import LocationPicker from '../components/LocationPicker.jsx';
import { useTypes, typeLabel } from '../useTypes.js';
import { Card, CardHeader, CardBody, Field, Input, FormGrid, Button, Alert, Muted } from '../components/ui.jsx';
import { MapPin } from 'lucide-react';

const KEYS = [
  'peshgiLimit', 'munshiAdvanceLimit', 'recoveryPct', 'kharchiFloor',
  'ratePathera', 'cutPathera', 'rateBharai', 'cutBharai', 'rateNikasi', 'cutNikasi',
  'rateJalai', 'priceAwwal', 'priceDoem', 'priceKhangar', 'hotLines',
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
    <div className="grid gap-4">
      <Card>
        <CardHeader title={t.settings} />
        <CardBody>
          <Muted>{t.limitNote}</Muted>
          {/* one compact row per setting: box, green save, red reset */}
          <div className="grid grid-cols-1 gap-x-5 gap-y-2.5 lg:grid-cols-2">
            {KEYS.map((k) => (
              <div key={k} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-1.5">
                <Field label={t[k]}>
                  <Input inputMode="decimal" disabled={!isOwner} value={vals[k] ?? ''} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} className="min-h-10" />
                </Field>
                {isOwner && <Button size="sm" className="min-h-10 bg-gain hover:bg-green-800" onClick={() => save(k)}>{t.save}</Button>}
                {isOwner && (
                  <DeleteButton
                    path={`/settings/${k}`} name={t[k]} label={t.resetDefault} variant="danger" className="min-h-10"
                    onDone={() => { setMsg({ text: t.savedOk, bad: false }); get('/settings').then(setVals).catch(() => {}); }}
                    onError={(m) => setMsg({ text: m, bad: true })}
                  />
                )}
              </div>
            ))}
          </div>
          <label className="flex items-center justify-center gap-2 text-md font-medium text-n-700">
            <input type="checkbox" disabled={!isOwner} className="size-5 min-h-0 accent-brand-600" checked={vals.allowNegativeStock === '1'}
              onChange={(e) => save('allowNegativeStock', e.target.checked ? '1' : '0')} />
            {t.allowNegativeStock}
          </label>
          {msg.text && <Alert tone={msg.bad ? 'err' : 'ok'}>{msg.text}</Alert>}
        </CardBody>
      </Card>

      <OpeningStock t={t} isOwner={isOwner} />
      <KilnLocation t={t} isOwner={isOwner} vals={vals} onSaved={(v) => setVals((x) => ({ ...x, ...v }))} />
      <TypesManager isOwner={isOwner} />
    </div>
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
    <Card>
      <CardHeader title={t.kilnLocation} />
      <CardBody>
        <Muted>{t.kilnLocationHint}</Muted>
        <LocationPicker
          lat={loc.kilnLat} lon={loc.kilnLon} disabled={!isOwner}
          onPick={(la, lo) => { setLoc((x) => ({ ...x, kilnLat: la, kilnLon: lo })); setMsg({ text: t.locPickedSave, bad: false }); }}
        />
        <FormGrid className="lg:grid-cols-3">
          <Field label={t.locPlace}><Input disabled={!isOwner} value={loc.kilnPlace} placeholder="e.g. Sadiqabad" onChange={(e) => setLoc({ ...loc, kilnPlace: e.target.value })} /></Field>
          <Field label={t.locLat}><Input disabled={!isOwner} inputMode="decimal" value={loc.kilnLat} placeholder="28.30000" onChange={(e) => setLoc({ ...loc, kilnLat: e.target.value })} /></Field>
          <Field label={t.locLon}><Input disabled={!isOwner} inputMode="decimal" value={loc.kilnLon} placeholder="70.13000" onChange={(e) => setLoc({ ...loc, kilnLon: e.target.value })} /></Field>
        </FormGrid>
        {isOwner && (
          <div className="flex flex-wrap justify-center gap-2">
            <Button disabled={busy} onClick={useGps}><MapPin className="size-4 shrink-0" aria-hidden="true" /> {t.locUseGps}</Button>
            <Button variant="secondary" disabled={busy} onClick={() => save()}>{t.save}</Button>
            {set && (
              <a className="inline-flex min-h-11 items-center rounded-lg bg-white px-4 font-semibold text-n-700 no-underline ring-1 ring-n-300 hover:bg-n-50"
                target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${vals.kilnLat},${vals.kilnLon}`}>{t.locOnMap}</a>
            )}
          </div>
        )}
        {msg.text && <Alert tone={msg.bad ? 'err' : 'ok'}>{msg.text}</Alert>}
      </CardBody>
    </Card>
  );
}

// What was physically on hand when the kiln started using the app; all stock figures start from it.
function OpeningStock({ t, isOwner }) {
  const { lang } = useLang();
  const items = useTypes('procurementItem');
  const [o, setO] = useState({ awwal: '', doem: '', khangar: '', green: '', coalKg: '', asOf: '', items: {} });
  const [msg, setMsg] = useState({ text: '', bad: false });
  useEffect(() => {
    get('/opening-stock').then((d) => setO({
      awwal: d.awwal || '', doem: d.doem || '', khangar: d.khangar || '', green: d.green || '', coalKg: d.coalKg || '', asOf: d.asOf || '', items: d.items || {},
    })).catch(() => {});
  }, []);
  async function save() {
    try {
      await put('/opening-stock', o);
      setMsg({ text: t.savedOk, bad: false });
    } catch (e) { setMsg({ text: e.message, bad: true }); }
  }
  const num = (v) => v.replace(/[^\d.]/g, '');
  const box = (key, label, unit) => (
    <Field key={key} label={`${label}${unit ? ` (${unit})` : ''}`}>
      <Input disabled={!isOwner} inputMode="decimal" placeholder="0" value={o[key]} onChange={(e) => setO({ ...o, [key]: num(e.target.value) })} />
    </Field>
  );
  return (
    <Card>
      <CardHeader title={t.openingStock} />
      <CardBody>
        <Muted>{t.openingStockHint}</Muted>
        <FormGrid className="lg:grid-cols-3">
          <Field label={t.openingAsOf}><Input type="date" disabled={!isOwner} value={o.asOf} onChange={(e) => setO({ ...o, asOf: e.target.value })} /></Field>
          {box('awwal', t.awwal)}
          {box('doem', t.doem)}
          {box('khangar', t.khangar)}
          {box('green', t.hsGreen)}
          {box('coalKg', t.hsCoal, 'kg')}
          {items.active.filter((i) => i.key !== 'coal').map((i) => (
            <Field key={i.key} label={typeLabel(i, lang)}>
              <Input disabled={!isOwner} inputMode="decimal" placeholder="0" value={o.items[i.key] ?? ''}
                onChange={(e) => setO({ ...o, items: { ...o.items, [i.key]: num(e.target.value) } })} />
            </Field>
          ))}
        </FormGrid>
        {isOwner && <Button onClick={save} className="justify-self-center sm:min-w-40">{t.save}</Button>}
        {msg.text && <Alert tone={msg.bad ? 'err' : 'ok'}>{msg.text}</Alert>}
      </CardBody>
    </Card>
  );
}
