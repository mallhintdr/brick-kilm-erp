import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { LangContext, useT, useLang } from './i18n.js';
import { clearSession, flushOutbox, getRole, getToken, getUsername, onOutboxChange, outboxCount } from './api.js';
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
import PrintWorkerSlip from './pages/PrintWorkerSlip.jsx';
import PrintKharchiSlip from './pages/PrintKharchiSlip.jsx';

function SyncBadge() {
  const t = useT();
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const refresh = () => outboxCount().then(setCount);
    const sync = () => flushOutbox().then(refresh);
    refresh();
    const off = onOutboxChange(refresh);
    const up = () => { setOnline(true); sync(); };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    const timer = setInterval(sync, 30000);
    return () => { off(); clearInterval(timer); window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  const cls = !online ? 'red' : count ? 'yellow' : 'green';
  const syncColor = !online ? '#f87171' : count ? '#fbbf24' : '#10b981';
  return (
    <button
      type="button"
      className={`sync-badge-wrapper ${cls}`}
      title={!online ? t.offline : count ? `${t.pending}: ${count}` : t.synced}
      aria-label={!online ? t.offline : count ? `${t.pending}: ${count}` : t.synced}
      onClick={() => flushOutbox()}
    >
      <Icon name="sync" color={syncColor} size={16} />
      {count > 0 && <span className="sync-count-bubble">{count}</span>}
    </button>
  );
}

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
};

function Icon({ name, size = 18, color }) {
  const glyph = ICONS[name] || ICONS.more;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color || 'currentColor'}
      strokeWidth="2.2"
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
  { to: '/firing', icon: 'firing', color: '#ef4444', labelKey: 'firing' },
  { to: '/kiln-board', icon: 'board', color: '#ea580c', labelKey: 'kilnBoard' },
  { to: '/moulding', icon: 'moulding', color: '#d97706', labelKey: 'moulding' },
  { to: '/cashbook', icon: 'cashbook', color: '#059669', labelKey: 'cashbook' },
  { to: '/kharchi', icon: 'kharchi', color: '#6366f1', labelKey: 'kharchiRun' },
  { to: '/peshgi', icon: 'money', color: '#10b981', labelKey: 'peshgi' },
  { to: '/sales', icon: 'sales', color: '#f43f5e', labelKey: 'sales' },
];

// Row 2: Commercial, Reports, Analytics & Master Settings
const ROW_2_LINKS = [
  { to: '/inventory', icon: 'inventory', color: '#0284c7', labelKey: 'nikasiTab' },
  { to: '/reports', icon: 'reports', color: '#0284c7', labelKey: 'reports' },
  { to: '/activity', icon: 'activity', color: '#f97316', labelKey: 'activity' },
  { to: '/insights', icon: 'insights', color: '#8b5cf6', labelKey: 'insights' },
  { to: '/workers', icon: 'workers', color: '#0d9488', labelKey: 'workers' },
  { to: '/settings', icon: 'settings', color: '#78716c', labelKey: 'settings' },
  { to: '/audit-logs', icon: 'auditLogs', color: '#64748b', labelKey: 'auditLogs', roles: ['owner', 'accountant'] },
  { to: '/users', icon: 'users', color: '#06b6d4', labelKey: 'users', roles: ['owner'] },
];

const visibleLinks = (links) => links.filter((l) => !l.roles || l.roles.includes(getRole()));
const ALL_LINKS = [...ROW_1_LINKS, ...ROW_2_LINKS];

// Primary items for mobile quick bottom navigation (Home + key operational areas)
const PRIMARY = [
  { to: '/home', icon: 'home', color: '#ea580c', labelKey: 'home' },
  ROW_1_LINKS[0], // Firing
  ROW_1_LINKS[1], // Kiln Board
  ROW_1_LINKS[2], // Moulding
  ROW_1_LINKS[3], // Cash Book
];

const MORE_LINKS = [
  ROW_1_LINKS[4], // Kharchi
  ROW_1_LINKS[5], // Peshgi
  ROW_1_LINKS[6], // Sales
  ...ROW_2_LINKS,
];

function MoreSheet({ open, onClose, t }) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={t.more} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        {visibleLinks(MORE_LINKS).map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            onClick={onClose}
            className={({ isActive }) => `sheet-link${isActive ? ' active' : ''}`}
          >
            <span style={{ display: 'inline-flex', marginInlineEnd: '0.75rem', opacity: 0.9 }}>
              <Icon name={l.icon} color={l.color} size={20} />
            </span>
            {t[l.labelKey]}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

function BottomNav({ t }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const moreActive = MORE_LINKS.some((l) => l.to === location.pathname);

  return (
    <>
      <nav className="bottom-nav" aria-label={t.appName}>
        {PRIMARY.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setMoreOpen(false)}
            className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
          >
            <Icon name={item.icon} color={item.color} size={20} />
            <span>{t[item.labelKey]}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`bottom-nav-item bottom-nav-more ${moreActive ? 'active' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <Icon name="more" color="#94a3b8" size={20} />
          <span>{t.more}</span>
        </button>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} t={t} />
    </>
  );
}

function Shell({ children }) {
  const t = useT();
  const { lang, setLang } = useLang();
  const nav = useNavigate();
  const location = useLocation();
  const role = getRole();
  const username = getUsername();
  const isHomePage = location.pathname === '/' || location.pathname === '/home';

  return (
    <>
      <a href="#main" className="skip-link">{t.skipToContent}</a>
      <div className="sticky-header-wrapper">
        <header className="top">
          {/* Brand Logo & Name - Clickable to navigate Home */}
          <NavLink to="/home" className="brand-badge" title={t.home}>
            <div className="brand-icon-box" aria-hidden="true">
              <Icon name="kilnLogo" color="#ffffff" size={19} />
            </div>
            <strong className="brand-text">{t.appName}</strong>
          </NavLink>

          {/* Dedicated Home Button for Quick One-Tap Navigation Back to Home */}
          <NavLink
            to="/home"
            className={`top-home-btn${isHomePage ? ' active' : ''}`}
            title={t.home}
            aria-label={t.home}
          >
            <Icon name="home" color={isHomePage ? '#ea580c' : '#f1f5f9'} size={16} />
            <span className="home-btn-label">{t.home}</span>
          </NavLink>

          <SyncBadge />
          <span className="grow" />

          <div className="top-actions">
            {/* SAD208 displayed directly over Owner */}
            <div className="top-user-badge" title={`Kiln SAD208 • ${username || 'Owner'}`}>
              <span className="user-kiln-code">SAD208</span>
              <span className="user-role-label">Owner</span>
            </div>

            {/* Language toggle: Urdu/English text in front and centrally aligned with language icon */}
            <button
              type="button"
              className="ghost top-lang-btn"
              title="Switch Language"
              onClick={() => setLang(lang === 'ur' ? 'en' : 'ur')}
            >
              <span className="lang-label">{t.lang}</span>
              <Icon name="globe" color="#38bdf8" size={14} />
            </button>

            <button
              type="button"
              className="ghost logout-btn"
              title={t.logout}
              aria-label={t.logout}
              onClick={() => { clearSession(); nav('/login'); }}
            >
              <Icon name="logout" color="#f87171" size={16} />
            </button>
          </div>
        </header>
      </div>

      <main id="main" tabIndex={-1}>{children}</main>
      <BottomNav t={t} />
    </>
  );
}

export default function App() {
  const [lang, setLangState] = useState(localStorage.getItem('lang') || 'ur');
  const setLang = (l) => { localStorage.setItem('lang', l); setLangState(l); };

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr';
  }, [lang]);

  const guard = (el) => (getToken() ? <Shell>{el}</Shell> : <Navigate to="/login" replace />);
  const bare = (el) => (getToken() ? el : <Navigate to="/login" replace />);

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
