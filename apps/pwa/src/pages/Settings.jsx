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
      <TypesManager isOwner={isOwner} />
    </>
  );
}
