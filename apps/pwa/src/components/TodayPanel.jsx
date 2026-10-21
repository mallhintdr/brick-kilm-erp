import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Hammer, Flame, Wallet, ListChecks, CloudSun, ArrowRight } from 'lucide-react';
import { useT, useLang } from '../i18n.js';
import { get, getUsername } from '../api.js';
import { useDataChanged } from './QuickEntry.jsx';
import { Skeleton, cx } from './ui.jsx';

const n = (v) => Number(v || 0).toLocaleString();

// Top of Home: greeting, today's date and weather, and four headline cards for the day.
export default function TodayPanel() {
  const t = useT();
  const { lang } = useLang();
  const [d, setD] = useState(null);
  const load = useCallback(() => {
    const day = new Date().toISOString().slice(0, 10);
    Promise.all([
      get(`/day?date=${day}`).catch(() => null), get('/stock-report').catch(() => null),
      get(`/cashbook?date=${day}`).catch(() => null), get('/weather').catch(() => null),
    ]).then(([dayData, stock, cash, wx]) => setD({ dayData, stock, cash, wx }));
  }, []);
  useEffect(() => { load(); }, [load]);
  useDataChanged(load);

  const hour = new Date(Date.now() + 5 * 3600e3).getUTCHours();
  // greeting by Pakistan time: morning 5–12, afternoon 12–17, evening 17–21, night 21–5
  const greet = hour >= 5 && hour < 12 ? t.goodMorning : hour >= 12 && hour < 17 ? t.goodAfternoon : hour >= 17 && hour < 21 ? t.goodEvening : t.goodNight;
  const dateText = new Date().toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Karachi' });
  if (!d) return <Skeleton className="h-52" />;

  const day = d.dayData;
  const moulded = day ? day.moulding.reduce((a, r) => a + r.count, 0) : 0;
  const a = day?.attendance;
  const missing = day ? [a.marked < a.active, !day.moulding.length, day.firing.length < 2, !day.bharai.length].filter(Boolean).length : 0;
  const today = d.wx?.days?.[0];
  const cards = [
    { to: '/daily', icon: Hammer, label: t.mouldedToday, value: n(moulded), color: '#d97706' },
    { to: '/kiln-board', icon: Flame, label: t.fireAtLine, value: d.stock?.situation?.fireAt ? `${t.line} ${d.stock.situation.fireAt}` : '—', color: '#dc2626' },
    { to: '/cashbook', icon: Wallet, label: t.closingCash, value: d.cash ? n(Math.round(Number(d.cash.closingCash))) : '—', color: '#059669' },
    { to: '/daily', icon: ListChecks, label: t.missingToday, value: missing ? `${missing} / 4` : '✓', color: missing ? '#b45309' : '#15803d' },
  ];

  return (
    <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 p-4 text-white shadow-lg sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-sm text-slate-300">{dateText}</p>
          <h1 className="m-0 truncate text-xl font-extrabold text-white sm:text-2xl">{greet}, {getUsername()}</h1>
        </div>
        {today && (
          <Link to="/weather" className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white no-underline ring-1 ring-white/15 hover:bg-white/15">
            <CloudSun className="size-5 text-amber-300" aria-hidden="true" />
            <span className="tabular-nums">{Math.round(today.tMax)}° / {Math.round(today.tMin)}°</span>
            {today.rainChance >= 30 && <span className="rounded-md bg-sky-500/30 px-1.5 text-xs">{today.rainChance}%</span>}
          </Link>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {cards.map(({ to, icon: Icon, label, value, color }) => (
          <Link key={label} to={to} className="group flex min-w-0 items-center gap-3 rounded-xl bg-white/95 p-3 text-n-900 no-underline shadow-sm transition hover:-translate-y-0.5 hover:bg-white">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${color} 14%, #fff)`, color }}><Icon className="size-5" aria-hidden="true" /></span>
            <span className="grid min-w-0">
              <span className="truncate text-xs font-semibold text-n-500">{label}</span>
              <strong className="truncate text-[15px] font-extrabold tabular-nums sm:text-[18px]" dir="ltr" style={{ color }}>{value}</strong>
            </span>
          </Link>
        ))}
      </div>
      <Link to="/daily" className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-md font-bold text-white no-underline hover:bg-brand-500">
        {t.dailyEntry} <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
      </Link>
    </section>
  );
}
