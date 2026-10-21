import { useEffect, useRef, useState } from 'react';
import { useFrozenColumns } from './useFrozenColumns.js';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { LangContext, useT, useLang } from './i18n.js';
import { clearSession, flushOutbox, getKilnCode, getRole, getToken, getUsername } from './api.js';
import Login from './pages/Login.jsx';
import Workers from './pages/Workers.jsx';
import Peshgi from './pages/Peshgi.jsx';
import Settings from './pages/Settings.jsx';
import Insights from './pages/Insights.jsx';
import KilnBoard from './pages/KilnBoard.jsx';
import Moulding from './pages/Moulding.jsx';
import Firing from './pages/Firing.jsx';
import Inventory from './pages/Inventory.jsx';
import Sales from './pages/Sales.jsx';
import Activity from './pages/Activity.jsx';
import CashBook from './pages/CashBook.jsx';
import AuditLogs from './pages/AuditLogs.jsx';
import Kharchi from './pages/Kharchi.jsx';
import Users from './pages/Users.jsx';
import Reports from './pages/Reports.jsx';
import Home from './pages/Home.jsx';
import KilnLogo from './components/KilnLogo.jsx';
import Weather from './pages/Weather.jsx';
import Khata from './pages/Khata.jsx';
import Roznamcha from './pages/Roznamcha.jsx';
import DailyEntry from './pages/DailyEntry.jsx';
import { QuickEntryHost, QuickAddFab } from './components/QuickEntry.jsx';
import Attendance from './pages/Attendance.jsx';
import Corrections from './pages/Corrections.jsx';
import PersonalFinance from './pages/PersonalFinance.jsx';
import PrintWorkerSlip from './pages/PrintWorkerSlip.jsx';
import PrintKharchiSlip from './pages/PrintKharchiSlip.jsx';
import { Toaster } from './components/ui.jsx';

// Crisp, high-precision SVG icons tailored for Kiln Operations ERP
const ICONS = {
  board: (
    <path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zm3 2h3v3H6V7zm6 0h6v3h-6V7zm-6 7h6v3H6v-3zm9 0h3v3h-3v-3z" />
  ),
  moulding: (
    <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3H4V7zm0 6h7v6H6a2 2 0 0 1-2-2v-4zm10 6h4a2 2 0 0 0 2-2v-4h-6v6z" />
  ),
  firing: (
    <path d="M12 2c1.5 3-1.5 4.5-1.5 7.5a4 4 0 0 0 7.5 2c0-2-1-3-1-4.5 3.5 2.5 4.5 6 4 9A8 8 0 0 1 4 14c0-4.5 4-6.5 4-10 1.5 0 2 1 2.5 2 0-2 1-3.5 1.5-4z" />
  ),
  money: (
    <path d="M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6zm4 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
  ),
  kharchi: (
    <path d="M9 7h6m-6 4h6m-6 4h4M5 3h14a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2z" />
  ),
  cashbook: (
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5zm4-11.5h8m-8 4h6" />
  ),
  inventory: (
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
  ),
  sales: (
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18m-5 4a4 4 0 0 1-8 0" />
  ),
  workers: (
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 10v-2a4 4 0 0 0-3-3.87m-4-12a4 4 0 0 1 0 7.75" />
  ),
  activity: (
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  ),
  insights: (
    <path d="M18 20V10M12 20V4M6 20v-6" />
  ),
  auditLogs: (
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zm-3-11 2 2 4-4" />
  ),
  users: (
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 10v-2a4 4 0 0 0-3-3.87m-4-12a4 4 0 0 1 0 7.75" />
  ),
  settings: (
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
  ),
  more: (
    <path d="M5 12h.01M12 12h.01M19 12h.01" />
  ),
  globe: (
    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 0c2.5 3.5 4 6.5 4 10s-1.5 6.5-4 10c-2.5-3.5-4-6.5-4-10s1.5-6.5 4-10zM2 12h20" />
  ),
  sync: (
    <>
      <path d="M21.5 2v6h-6M2.5 22v-6h6" />
      <path d="M21 12A9 9 0 0 0 5.6 5.6L2.5 8M3 12a9 9 0 0 0 15.4 6.4l3.1-2.4" />
    </>
  ),
  logout: (
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9" />
  ),
  kilnLogo: (
    <>
      <line x1="3" y1="22" x2="21" y2="22" />
      <polygon points="9,22 10.5,5 13.5,5 15,22" />
      <rect x="10" y="3.5" width="4" height="1.8" rx="0.5" />
      <line x1="9.6" y1="17.5" x2="14.4" y2="17.5" />
      <line x1="10.1" y1="13" x2="13.9" y2="13" />
      <line x1="10.6" y1="8.5" x2="13.4" y2="8.5" />
      <path d="M12 3.5 C11.5 2 13 1.5 13.5 0.5" />
    </>
  ),
  home: (
    <path d="M3 10.5 12 3l9 7.5V20a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-4a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9.5z" />
  ),
  reports: (
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8" />
  ),
  chevronRight: (
    <polyline points="9 18 15 12 9 6" />
  ),
  chevronLeft: (
    <polyline points="15 18 9 12 15 6" />
  ),
};

function Icon({ name, size = 18, color, stroke = 2.2 }) {
  const glyph = ICONS[name] || ICONS.more;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color || 'currentColor'}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {glyph}
    </svg>
  );
}

// Row 1: Core Daily Kiln Operations & Field Logs (ordered by high daily frequency)
const ROW_1_LINKS = [
  { to: '/firing', icon: 'firing', color: '#ef4444', labelKey: 'firingAndBoard' },
  { to: '/kiln-board', icon: 'board', color: '#ea580c', labelKey: 'kilnBoard' },
  { to: '/moulding', icon: 'moulding', color: '#d97706', labelKey: 'moulding' },
  { to: '/loading', icon: 'board', color: '#2563eb', labelKey: 'loadingBharai' },
  { to: '/unloading', icon: 'inventory', color: '#16a34a', labelKey: 'unloadingNikasi' },
  { to: '/cashbook', icon: 'cashbook', color: '#059669', labelKey: 'cashbook' },
  { to: '/kharchi', icon: 'kharchi', color: '#6366f1', labelKey: 'kharchiRun' },
  { to: '/peshgi', icon: 'money', color: '#10b981', labelKey: 'peshgi' },
  { to: '/sales', icon: 'sales', color: '#f43f5e', labelKey: 'sales' },
];

// Row 2: Commercial, Reports, Analytics & Master Settings
const ROW_2_LINKS = [
  { to: '/inventory', icon: 'inventory', color: '#0284c7', labelKey: 'purchasesKhareed' },
  { to: '/reports', icon: 'reports', color: '#0284c7', labelKey: 'reports' },
  { to: '/activity', icon: 'activity', color: '#f97316', labelKey: 'activity' },
  { to: '/insights', icon: 'insights', color: '#8b5cf6', labelKey: 'insights' },
  { to: '/weather', icon: 'insights', color: '#0ea5e9', labelKey: 'weather' },
  { to: '/khata', icon: 'kharchi', color: '#9333ea', labelKey: 'khataTitle' },
  { to: '/roznamcha', icon: 'reports', color: '#0f766e', labelKey: 'roznamcha' },
  { to: '/daily', icon: 'reports', color: '#ea580c', labelKey: 'dailyEntry' },
  { to: '/attendance', icon: 'workers', color: '#16a34a', labelKey: 'attendance' },
  { to: '/corrections', icon: 'settings', color: '#dc2626', labelKey: 'corrections', roles: ['owner'] },
  { to: '/personal', icon: 'money', color: '#7c3aed', labelKey: 'personalFinance', roles: ['owner'] },
  { to: '/workers', icon: 'workers', color: '#0d9488', labelKey: 'workers' },
  { to: '/settings', icon: 'settings', color: '#78716c', labelKey: 'settings' },
  { to: '/audit-logs', icon: 'auditLogs', color: '#64748b', labelKey: 'auditLogs', roles: ['owner', 'accountant'] },
  { to: '/users', icon: 'users', color: '#06b6d4', labelKey: 'users', roles: ['owner'] },
];

const visibleLinks = (links) => links.filter((l) => !l.roles || l.roles.includes(getRole()));
const ALL_LINKS = [...ROW_1_LINKS, ...ROW_2_LINKS];

// Offline entries queue in the outbox; push them whenever the connection is back and every 30s.
// Runs silently (the status bar that showed it was removed).
function useBackgroundSync() {
  useEffect(() => {
    const sync = () => { if (navigator.onLine) flushOutbox().catch(() => {}); };
    sync();
    window.addEventListener('online', sync);
    const timer = setInterval(sync, 30000);
    return () => { clearInterval(timer); window.removeEventListener('online', sync); };
  }, []);
}

function Shell({ children }) {
  const t = useT();
  const mainRef = useRef(null);
  useFrozenColumns(mainRef);
  useBackgroundSync();
  const { lang, setLang } = useLang();
  const nav = useNavigate();
  const username = getUsername();
  // tapping the logo (back to Home) makes the chimney pour out a thick cloud of smoke
  const [smokeBurst, setSmokeBurst] = useState(null);
  const kilnCode = getKilnCode();

  return (
    <div className="app-shell flex min-h-dvh flex-col bg-n-50">
      <a href="#main" className="skip-link">{t.skipToContent}</a>
      <div className="sticky-header-wrapper sticky top-0 z-40 bg-gradient-to-b from-slate-900 to-slate-800 shadow-md print:hidden">
        <header className="mx-auto flex h-14 max-w-[1280px] items-center gap-2 px-3 sm:h-16 sm:px-4">
          {/* logo and name: back to Home (the chimney puffs out a cloud of smoke) */}
          <NavLink to="/home" title={t.home} onClick={() => setSmokeBurst(Date.now())}
            className="flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1 no-underline hover:bg-white/5">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-600 shadow-[0_2px_8px_rgba(234,88,12,.45)]" aria-hidden="true">
              <KilnLogo size={30} color="#ffffff" burst={smokeBurst} />
            </span>
            <span className="grid min-w-0 leading-tight">
              <strong className="truncate text-base font-extrabold text-white sm:text-lg">{t.appName}</strong>
              <small className="text-2xs font-semibold text-slate-400">v{__APP_VERSION__}</small>
            </span>
          </NavLink>

          <span className="flex-1" />

          {/* single toggle: shows the language it switches to */}
          <button
            type="button" onClick={() => setLang(lang === 'ur' ? 'en' : 'ur')}
            title={lang === 'ur' ? 'English' : 'اردو'} aria-label={lang === 'ur' ? 'Switch to English' : 'اردو میں بدلیں'}
            className="inline-flex size-10 min-h-10 shrink-0 items-center justify-center rounded-lg border-0 bg-white/10 p-0 font-sans text-sm leading-none font-extrabold text-white ring-1 ring-white/20 hover:bg-white/20"
          >
            {lang === 'ur' ? 'EN' : 'UR'}
          </button>
          <button
            type="button" title={username} aria-label={`${t.logout || 'Logout'} ${username}`}
            onClick={() => { clearSession(); nav('/login'); }}
            className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border-0 bg-red-600 px-2.5 text-white hover:bg-red-700"
          >
            <Icon name="logout" color="#ffffff" size={16} stroke={2.75} />
            <span className="max-w-20 truncate font-sans text-xs font-bold">{username}</span>
          </button>
        </header>
      </div>

      <Toaster />
      <QuickEntryHost />
      {/* desktop: the + button in the corner (phones have it in the tab bar) */}
      <QuickAddFab className="fixed bottom-6 end-6 z-40 hidden lg:grid print:hidden" />
      <main id="main" ref={mainRef} tabIndex={-1}
        className="mx-auto w-full max-w-[1280px] flex-1 px-3 pt-3 pb-[calc(84px+env(safe-area-inset-bottom))] outline-none sm:px-4 sm:pt-4 lg:pb-8">
        {children}
      </main>

      {/* phones and tablets: the most used pages one thumb away */}
      <nav aria-label={t.home}
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-end gap-1 border-t border-n-200 bg-white/95 px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden print:hidden">
        {[['/home', 'home', t.home], ['/daily', 'reports', t.dailyEntry], ['+'], ['/kiln-board', 'board', t.kilnBoard], ['/khata', 'kharchi', t.khataTitle]].map(([to, icon, label]) => (to === '+'
          ? <div key="+" className="grid place-items-center pb-1"><QuickAddFab className="-mt-6 size-13 ring-4 ring-white" /></div>
          : (
          <NavLink key={to} to={to}
            className={({ isActive }) => `flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-0.5 py-1.5 text-2xs font-semibold no-underline ${isActive ? 'bg-brand-50 text-brand-700' : 'text-n-500 hover:text-n-900'}`}>
            <span className="[&_svg]:stroke-current"><Icon name={icon} size={20} stroke={2} /></span>
            <span className="max-w-full truncate">{label}</span>
          </NavLink>
        )))}
      </nav>
    </div>
  );
}

function RequireAuth({ children, shell = false }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return shell ? <Shell>{children}</Shell> : children;
}

export default function App() {
  const [lang, setLangState] = useState(localStorage.getItem('lang') || 'ur');
  const setLang = (l) => { localStorage.setItem('lang', l); setLangState(l); };

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr';
  }, [lang]);

  // The token check must happen when the route renders, not when App last rendered:
  // App doesn't re-render on login, so a check baked into these elements stayed stale
  // and bounced a freshly logged-in user back to /login until a hard refresh.
  const guard = (el) => <RequireAuth shell>{el}</RequireAuth>;
  const bare = (el) => <RequireAuth>{el}</RequireAuth>;

  const homeLinks = ALL_LINKS.map((l) => ({
    ...l,
    iconGlyph: ICONS[l.icon] || ICONS.more,
  }));

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/print/worker/:id" element={bare(<PrintWorkerSlip />)} />
        <Route path="/print/kharchi/:id" element={bare(<PrintKharchiSlip />)} />
        <Route path="/" element={guard(<Home links={homeLinks} />)} />
        <Route path="/home" element={guard(<Home links={homeLinks} />)} />
        <Route path="/kiln-board" element={guard(<KilnBoard />)} />
        <Route path="/weather" element={guard(<Weather />)} />
        <Route path="/khata" element={guard(<Khata />)} />
        <Route path="/roznamcha" element={guard(<Roznamcha />)} />
        <Route path="/daily" element={guard(<DailyEntry />)} />
        <Route path="/attendance" element={guard(<Attendance />)} />
        <Route path="/corrections" element={guard(<Corrections />)} />
        <Route path="/personal" element={guard(<PersonalFinance />)} />
        <Route path="/loading" element={guard(<KilnBoard key="load" focus="load" />)} />
        <Route path="/unloading" element={guard(<KilnBoard key="unload" focus="unload" />)} />
        <Route path="/moulding" element={guard(<Moulding />)} />
        <Route path="/firing" element={guard(<Firing />)} />
        <Route path="/kharchi" element={guard(<Kharchi />)} />
        <Route path="/cashbook" element={guard(<CashBook />)} />
        <Route path="/inventory" element={guard(<Inventory />)} />
        <Route path="/sales" element={guard(<Sales />)} />
        <Route path="/workers" element={guard(<Workers />)} />
        <Route path="/peshgi" element={guard(<Peshgi />)} />
        <Route path="/activity" element={guard(<Activity />)} />
        <Route path="/insights" element={guard(<Insights />)} />
        <Route path="/reports" element={guard(<Reports />)} />
        <Route path="/audit-logs" element={guard(<AuditLogs />)} />
        <Route path="/users" element={guard(<Users />)} />
        <Route path="/settings" element={guard(<Settings />)} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </LangContext.Provider>
  );
}
