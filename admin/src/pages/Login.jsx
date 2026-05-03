import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../AuthContext.jsx';
import { apiFetch } from '../api.js';
import PasswordField from '../components/PasswordField.jsx';
import AuthShell from '../components/AuthShell.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import { notify } from '../toast.js';

export default function Login() {
  const { setToken, isAuthed } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthed) return <Navigate to="/dashboard" replace />;

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const data = await apiFetch('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      setToken(data.token, data.user?.email || email.trim());
      notify.ok('Angemeldet');
      nav('/dashboard');
    } catch (e2) {
      const apiMsg = e2?.data?.error || e2.message || 'Anmeldung fehlgeschlagen';
      const hint =
        e2?.status === 401
          ? ' — E-Mail und Passwort prüfen; bei Bedarf im Backend `npm run seed-admin` ausführen.'
          : '';
      const full = apiMsg + hint;
      setErr(full);
      notify.err(full);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <form onSubmit={submit}>
        <div className="auth-brand">
          <BrandLogo variant="auth" aria-hidden />
          <div>
            <h1>Verwaltungsportal</h1>
            <p className="muted">MisterWatch · Wissensdatenbank &amp; Kundenverwaltung</p>
          </div>
        </div>

        <div className="auth-features">
          <span className="auth-chip auth-chip--cyan">Live-Daten</span>
          <span className="auth-chip auth-chip--violet">Sicher</span>
          <span className="auth-chip">PostgreSQL</span>
        </div>

        <div className="auth-divider" />

        {err ? <div className="banner-error">{err}</div> : null}

        <label className="field">
          <span>E-Mail</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@firma.de"
            required
          />
        </label>
        <PasswordField
          label="Passwort"
          id="login-password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <motion.button
          type="submit"
          className="btn-primary"
          disabled={loading}
          whileTap={{ scale: 0.98 }}
          style={{ width: '100%', marginTop: 4 }}
        >
          {loading ? 'Anmelden…' : 'Anmelden'}
        </motion.button>

        <div className="auth-links-row">
          <Link to="/reset-password">Passwort vergessen?</Link>
        </div>

        <p className="auth-footnote">
          Der System-Prompt liegt im Backend; KB-Einträge werden ergänzend an den Chatbot angehängt.
        </p>
      </form>
    </AuthShell>
  );
}
