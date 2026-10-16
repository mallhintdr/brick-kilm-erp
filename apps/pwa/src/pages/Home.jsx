import { Link } from 'react-router-dom';
import { useT } from '../i18n.js';
import { getRole } from '../api.js';

const GROUPS = [
  { titleKey: 'dailyOps', paths: ['/moulding', '/loading', '/kiln-board', '/firing', '/unloading'] },
  { titleKey: 'commercialAndFinance', paths: ['/cashbook', '/roznamcha', '/khata', '/sales', '/peshgi', '/kharchi', '/inventory'] },
  { titleKey: 'managementAndReports', paths: ['/reports', '/insights', '/weather', '/activity', '/workers', '/settings', '/audit-logs', '/users'] },
];

export default function Home({ links = [] }) {
  const t = useT();
  const role = getRole();
  const visible = links.filter((l) => !l.roles || l.roles.includes(role));

  return (
    <div className="home-page-container">
      {GROUPS.map((g) => {
        const items = g.paths.map((p) => visible.find((l) => l.to === p)).filter(Boolean);
        if (!items.length) return null;
        return (
          <section key={g.titleKey} className="home-group" aria-label={t[g.titleKey]}>
            <h2 className="home-group-title">{t[g.titleKey]}</h2>
            <div className="home-module-grid">
              {items.map((l) => (
                <Link key={l.to} to={l.to} className="home-module">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={l.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {l.iconGlyph}
                  </svg>
                  <span>{t[l.labelKey]}</span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
