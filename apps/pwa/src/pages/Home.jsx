import { Link } from 'react-router-dom';
import { useT } from '../i18n.js';
import { getRole } from '../api.js';
import HomeStock from '../components/HomeStock.jsx';
import { SectionTitle } from '../components/ui.jsx';

const GROUPS = [
  { titleKey: 'dailyOps', paths: ['/daily', '/weekly', '/attendance', '/moulding', '/loading', '/kiln-board', '/firing', '/unloading'] },
  { titleKey: 'commercialAndFinance', paths: ['/cashbook', '/roznamcha', '/khata', '/sales', '/peshgi', '/kharchi', '/inventory', '/personal'] },
  { titleKey: 'managementAndReports', paths: ['/reports', '/insights', '/weather', '/activity', '/workers', '/settings', '/corrections', '/audit-logs', '/users'] },
];

export default function Home({ links = [] }) {
  const t = useT();
  const role = getRole();
  const visible = links.filter((l) => !l.roles || l.roles.includes(role));

  return (
    <div className="grid gap-4">
      <HomeStock />
      {GROUPS.map((g) => {
        const items = g.paths.map((p) => visible.find((l) => l.to === p)).filter(Boolean);
        if (!items.length) return null;
        return (
          <section key={g.titleKey} className="grid gap-3 rounded-lg bg-white p-3.5 ring-1 ring-n-200" aria-label={t[g.titleKey]}>
            <SectionTitle>{t[g.titleKey]}</SectionTitle>
            {/* the full name always shows: it wraps to a second line instead of being cut */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {items.map((l) => (
                <Link key={l.to} to={l.to}
                  className="flex min-h-13 items-center gap-2.5 rounded-lg bg-white px-3 py-2 text-md font-semibold leading-tight text-n-900 no-underline ring-1 ring-n-200 transition hover:bg-brand-50 hover:ring-brand-300">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md leading-none" style={{ background: `color-mix(in srgb, ${l.color} 12%, #fff)` }}>
                    <svg className="block" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={l.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {l.iconGlyph}
                    </svg>
                  </span>
                  <span className="min-w-0 break-words">{t[l.labelKey]}</span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
