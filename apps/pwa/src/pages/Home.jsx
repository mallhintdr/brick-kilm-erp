import { Link } from 'react-router-dom';
import { useT } from '../i18n.js';
import { getRole } from '../api.js';

const GROUPS = [
  { titleKey: 'dailyOps', paths: ['/firing', '/kiln-board', '/moulding', '/inventory'] },
  { titleKey: 'commercialAndFinance', paths: ['/cashbook', '/kharchi', '/peshgi', '/sales'] },
  { titleKey: 'managementAndReports', paths: ['/reports', '/insights', '/activity', '/workers', '/settings', '/audit-logs', '/users'] },
];

export default function Home({ links = [] }) {
  const t = useT();
  const role = getRole();
  const visible = links.filter((l) => !l.roles || l.roles.includes(role));

  return (
    <div className="home-page-container">
      {GROUPS.map((g) => {
        const items = visible.filter((l) => g.paths.includes(l.to));
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
