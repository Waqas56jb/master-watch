import {
  CalendarCheck,
  LayoutDashboard,
  MessageSquareMore,
  BookOpen,
  Palette,
  Sparkles,
  Users,
  UserCircle,
} from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../AuthContext.jsx';
import { useState } from 'react';

const links = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/inquiries', label: 'Anfragen', Icon: MessageSquareMore },
  { to: '/bookings', label: 'Buchungen', Icon: CalendarCheck },
  { to: '/feedback', label: 'Feedback', Icon: Sparkles },
  { to: '/contacts', label: 'Kontakte', Icon: Users },
  { to: '/knowledge', label: 'Knowledge Base', Icon: BookOpen },
  { to: '/chat-appearance', label: 'Chat Farben', Icon: Palette },
  { to: '/account', label: 'Konto', Icon: UserCircle },
];

export default function Layout({ children }) {
  const location = useLocation();
  const { email, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  function goLogin() {
    logout();
    nav('/login');
    setOpen(false);
  }

  return (
    <div className="layout-root">
      <div
        className={`sidebar-backdrop ${open ? 'open' : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <motion.div className="sidebar-brand" initial={false}>
          <span className="logo-ring lg" />
          <div>
            <div className="sidebar-title">MisterWatch</div>
            <div className="sidebar-sub">Admin · Ops</div>
          </div>
        </motion.div>

        <nav className="sidebar-nav">
          {links.map((l) => {
            const Ico = l.Icon;
            return (
              <motion.div key={l.to} whileHover={{ x: 4 }} transition={{ type: 'spring', stiffness: 520, damping: 32 }}>
                <NavLink
                  to={l.to}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={() => setOpen(false)}
                  end={l.to === '/dashboard'}
                >
                  <Ico className="sidebar-ico-lucide" aria-hidden strokeWidth={1.95} />
                  <span>{l.label}</span>
                </NavLink>
              </motion.div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">{email || 'Admin'}</div>
          <button type="button" className="btn-ghost sidebar-logout" onClick={goLogin}>
            Ausloggen
          </button>
        </div>
      </aside>

      <div className="layout-main-wrap">
        <header className="topbar">
          <button type="button" className="menu-toggle" onClick={() => setOpen(!open)} aria-label="Menü">
            <span />
            <span />
            <span />
          </button>
          <div className="topbar-crumb">
            <span className="pill">Live</span>
            <span className="muted">Neon · Chatbot CRM</span>
          </div>
        </header>
        <main className="layout-main">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
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
