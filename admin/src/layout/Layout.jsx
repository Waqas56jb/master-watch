import {
  HiOutlineBookOpen,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftRight,
  HiOutlineChatBubbleOvalLeft,
  HiOutlineSparkles,
  HiOutlineSquares2X2,
  HiOutlineSwatch,
  HiOutlineUserCircle,
  HiOutlineUserGroup,
} from 'react-icons/hi2';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../AuthContext.jsx';
import { useMemo, useState, useEffect } from 'react';
import BrandLogo from '../components/BrandLogo.jsx';

function initialSidebarOpen() {
  if (typeof window === 'undefined') return true;
  return window.innerWidth > 900;
}

const navGroups = [
  {
    label: 'Übersicht',
    items: [{ to: '/dashboard', label: 'Dashboard', Icon: HiOutlineSquares2X2 }],
  },
  {
    label: 'CRM & Kunden',
    items: [
      { to: '/inquiries', label: 'Anfragen', Icon: HiOutlineChatBubbleLeftRight },
      { to: '/bookings', label: 'Buchungen', Icon: HiOutlineCalendarDays },
      { to: '/feedback', label: 'Feedback', Icon: HiOutlineSparkles },
      { to: '/contacts', label: 'Kontakte', Icon: HiOutlineUserGroup },
    ],
  },
  {
    label: 'Inhalt',
    items: [
      { to: '/chat-activity', label: 'Chat-Aktivität', Icon: HiOutlineChatBubbleOvalLeft },
      { to: '/knowledge', label: 'Knowledge Base', Icon: HiOutlineBookOpen },
      { to: '/chat-appearance', label: 'Chat-Erscheinung', Icon: HiOutlineSwatch },
    ],
  },
  {
    label: 'System',
    items: [{ to: '/account', label: 'Konto', Icon: HiOutlineUserCircle }],
  },
];

const ROUTE_META = {
  '/dashboard': { title: 'Überblick', sub: 'KPIs & Trends' },
  '/inquiries': { title: 'Anfragen & Support', sub: 'Leads, Tickets, Notizen' },
  '/bookings': { title: 'Buchungen', sub: 'Anfragen & Status' },
  '/feedback': { title: 'Kundenfeedback', sub: 'Bewertungen & Stimmen' },
  '/contacts': { title: 'Kontakte', sub: 'CRM-Adressen' },
  '/chat-activity': { title: 'Chat-Aktivität', sub: 'Nutzung & Events' },
  '/knowledge': { title: 'Knowledge Base', sub: 'Chatbot-Wissen' },
  '/chat-appearance': { title: 'Chatbot-Erscheinungsbild', sub: 'Farben & öffentliches Theme' },
  '/account': { title: 'Konto', sub: 'Sicherheit & Profil' },
};

function initialsFromEmail(email) {
  const s = (email || 'A').trim();
  const p = s.split('@')[0] || 'A';
  return p.slice(0, 2).toUpperCase();
}

export default function Layout({ children }) {
  const location = useLocation();
  const { email, logout } = useAuth();
  const nav = useNavigate();
  const [navOpen, setNavOpen] = useState(initialSidebarOpen);

  useEffect(() => {
    function onResize() {
      if (window.innerWidth > 900) return;
      setNavOpen(false);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const meta = ROUTE_META[location.pathname] || { title: 'Admin', sub: '' };

  const initials = useMemo(() => initialsFromEmail(email), [email]);

  function goLogin() {
    logout();
    nav('/login');
    setNavOpen(false);
  }

  function toggleNav() {
    setNavOpen((v) => !v);
  }

  return (
    <div className={`layout-root ${navOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <div
        className={`sidebar-backdrop ${navOpen ? 'open' : ''}`}
        onClick={() => setNavOpen(false)}
        aria-hidden={!navOpen}
      />
      <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <BrandLogo variant="sidebar" aria-hidden />
          <div>
            <div className="sidebar-title">MisterWatch</div>
            <div className="sidebar-sub">Admin Console</div>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Hauptnavigation">
          {navGroups.map((g) => (
            <div key={g.label} className="nav-group">
              {g.items.map((l) => {
                const Ico = l.Icon;
                return (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                    onClick={() => window.innerWidth <= 900 && setNavOpen(false)}
                    end={l.to === '/dashboard'}
                  >
                    <Ico className="sidebar-ico-ri" aria-hidden />
                    <span>{l.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-status">
            <span className="sidebar-status-dot" aria-hidden />
            <span>Online</span>
          </div>
          <div className="sidebar-user mono-sm">{email || 'Admin'}</div>
          <button type="button" className="btn-sidebar-logout" onClick={goLogin}>
            Ausloggen
          </button>
        </div>
      </aside>

      <div className="layout-main-wrap">
        <header className="topbar">
          <button
            type="button"
            className={`menu-toggle ${navOpen ? 'is-open' : ''}`}
            onClick={toggleNav}
            aria-label={navOpen ? 'Navigation schließen' : 'Navigation öffnen'}
            aria-expanded={navOpen}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="topbar-main">
            <div className="topbar-titles">
              <h1 className="topbar-title">{meta.title}</h1>
              {meta.sub ? <p className="topbar-sub muted">{meta.sub}</p> : null}
            </div>
            <div className="topbar-user" title={email || ''}>
              <span className="topbar-avatar">{initials}</span>
            </div>
          </div>
        </header>
        <main className="layout-main">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="page-motion-wrap"
            >
              {children || <Outlet />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
