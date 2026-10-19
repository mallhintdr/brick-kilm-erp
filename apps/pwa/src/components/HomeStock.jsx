import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT, useLang } from '../i18n.js';
import { get } from '../api.js';
import { useTypes, typeLabel } from '../useTypes.js';

const n = (v) => Math.round(Number(v || 0)).toLocaleString();

// Front-page stock box: fired bricks by grade, green bricks, bricks in the kiln and coal left.
// Other purchased items are in the goods receipt list on the Inventory page.
export default function HomeStock() {
  const t = useT();
  const { lang } = useLang();
  const items = useTypes('procurementItem');
  const [r, setR] = useState(null);
  useEffect(() => { get('/stock-report').then(setR).catch(() => {}); }, []);
  if (!r) return null;
  const itemName = (key) => { const ty = items.types.find((x) => x.key === key); return ty ? typeLabel(ty, lang) : key; };

  const cells = [
    { label: t.awwal, value: n(r.stock.awwal), tone: 'teal' },
    { label: t.doem, value: n(r.stock.doem), tone: 'blue' },
    { label: t.khangar, value: n(r.stock.khangar), tone: 'violet' },
    { label: t.hsGreen, value: n(r.stock.green), tone: 'orange' },
    { label: t.hsInKiln, value: n(r.jalai.bricksInKiln), tone: 'pink' },
    { label: t.hsCoal, value: `${n(r.coal.remainingKg)} kg`, tone: r.coal.remainingKg < 0 ? 'pink' : 'teal', warn: r.coal.remainingKg < 0 },
  ];

  return (
    <section className="home-group home-stock" aria-label={t.hsTitle}>
      <h2 className="home-group-title">
        <Link to="/inventory" className="home-stock-link">{t.hsTitle}</Link>
      </h2>
      <div className="home-stock-grid">
        {cells.map((c) => (
          <div key={c.label} className={`stat tone-${c.tone}`}>
            <span>{c.label}{c.sub ? ` (${c.sub})` : ''}</span>
            <strong className={c.warn ? 'err' : undefined}>{c.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
