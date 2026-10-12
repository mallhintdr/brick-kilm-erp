import { Link } from 'react-router-dom';
import { useT } from '../i18n.js';
import { getRole } from '../api.js';

export default function Home({ links = [] }) {
  const t = useT();
  const role = getRole();

  const operationalLinks = links.filter((l) =>
    ['/firing', '/kiln-board', '/moulding', '/inventory'].includes(l.to)
  );

  const financialLinks = links.filter((l) =>
    ['/cashbook', '/kharchi', '/peshgi', '/sales'].includes(l.to)
  );

  const managementLinks = links.filter((l) =>
    ['/reports', '/insights', '/activity', '/workers', '/settings', '/audit-logs', '/users'].includes(l.to)
  );

  const renderCard = (l) => (
    <Link
      key={l.to}
      to={l.to}
      className="home-nav-card"
      style={{ '--card-accent': l.color }}
    >
      <div className="home-nav-icon-wrapper" style={{ background: `${l.color}18`, borderColor: `${l.color}45` }}>
        <svg
          viewBox="0 0 24 24"
          width="26"
          height="26"
          fill="none"
          stroke={l.color}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {l.iconGlyph}
        </svg>
      </div>
      <div className="home-nav-info">
        <strong className="home-nav-title">{t[l.labelKey]}</strong>
        <span className="home-nav-arrow" aria-hidden="true">→</span>
      </div>
    </Link>
  );

  return (
    <div className="home-page-container">
      {/* Hero Welcome Banner */}
      <div className="home-hero-banner">
        <div className="home-hero-content">
          <div className="home-hero-tag">
            <span>🔥 SAD208 • {role ? role.toUpperCase() : 'PORTAL'}</span>
          </div>
          <h1 className="home-hero-title">{t.appName}</h1>
          <p className="home-hero-sub">{t.quickOverview}</p>
        </div>
      </div>

      {/* Row 1: Core Daily Operations */}
      <section className="home-section" aria-label={t.dailyOps}>
        <div className="home-section-header">
          <span className="home-section-icon">🧱</span>
          <h2 className="home-section-title">{t.dailyOps}</h2>
        </div>
        <div className="home-grid">
          {operationalLinks.map(renderCard)}
        </div>
      </section>

      {/* Row 2: Commercial & Finances */}
      <section className="home-section" aria-label={t.commercialAndFinance}>
        <div className="home-section-header">
          <span className="home-section-icon">💰</span>
          <h2 className="home-section-title">{t.commercialAndFinance}</h2>
        </div>
        <div className="home-grid">
          {financialLinks.map(renderCard)}
        </div>
      </section>

      {/* Row 3: Management, Reports & Master Controls */}
      <section className="home-section" aria-label={t.managementAndReports}>
        <div className="home-section-header">
          <span className="home-section-icon">📊</span>
          <h2 className="home-section-title">{t.managementAndReports}</h2>
        </div>
        <div className="home-grid">
          {managementLinks.map(renderCard)}
        </div>
      </section>
    </div>
  );
}
