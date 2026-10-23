import { Link } from 'react-router-dom';
import { useT } from '../i18n.js';
import { getRole } from '../api.js';
import HomeStock from '../components/HomeStock.jsx';
import TodayPanel from '../components/TodayPanel.jsx';
import { SectionTitle } from '../components/ui.jsx';

// Five main sections; everything else sits under "More" (closed by default)
const GROUPS = [
  { titleKey: 'secToday', paths: ['/daily', '/attendance', '/weekly'] },
  { titleKey: 'secKiln', paths: ['/kiln-board', '/firing', '/moulding', '/loading', '/unloading'] },
  { titleKey: 'secPeople', paths: ['/workers', '/khata', '/kharchi', '/peshgi'] },
  { titleKey: 'secMoney', paths: ['/cashbook', '/sales', '/inventory', '/parties', '/personal'] },
  { titleKey: 'secReports', paths: ['/insights', '/reports', '/roznamcha', '/health'] },
  { titleKey: 'more', more: true, paths: ['/weather', '/activity', '/audit-logs', '/corrections', '/settings', '/users'] },
];

export default function Home({ links = [] }) {
  const t = useT();
  const role = getRole();
  const visible = links.filter((l) => !l.roles || l.roles.includes(role));

  return (
    <div className="grid gap-4">
      <TodayPanel />
      <HomeStock />
      {GROUPS.map((g) => {
        const items = g.paths.map((p) => visible.find((l) => l.to === p)).filter(Boolean);
        if (!items.length) return null;
        return (
          <Wrap more={g.more} label={t[g.titleKey]} key={g.titleKey}><section className="grid gap-3 rounded-lg bg-white p-3.5 ring-1 ring-n-200" aria-label={t[g.titleKey]}>
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
          </section></Wrap>
        );
      })}
    </div>
  );
}

// "More" opens on tap so Home stays short
function Wrap({ more, label, children }) {
  if (!more) return children;
  return (
    <details className="group">
      <summary className="mx-auto w-fit cursor-pointer list-none rounded-full bg-white px-4 py-2 text-sm font-bold text-n-700 ring-1 ring-n-200">{label} ▾</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
