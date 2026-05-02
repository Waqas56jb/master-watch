import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { apiFetch } from '../api.js';

/**
 * Built-in admin login (no .env on the client). These strings ship in the JS bundle — anyone can read them.
 * The API still checks the real user + hash in the database; run `npm run seed-admin` in backend if login fails.
 */
const BUILTIN_ADMIN = {
  email: 'wasifjaved@gmail.com',
  password: 'wasif@123!',
};

export default function Login() {
  const { setToken, isAuthed } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState(BUILTIN_ADMIN.email);
  const [password, setPassword] = useState(BUILTIN_ADMIN.password);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthed) return <Navigate to="/dashboard" replace />;

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const em = email.trim().toLowerCase();
    const pw = password;
    if (em !== BUILTIN_ADMIN.email.toLowerCase() || pw !== BUILTIN_ADMIN.password) {
      setErr('Ungültige Zugangsdaten');
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: em, password: pw }),
      });
      setToken(data.token, data.user?.email || email.trim());
      nav('/dashboard');
    } catch (e2) {
      setErr(e2?.data?.error || e2.message || 'Login fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-glow" />
      <form className="login-card glass" onSubmit={submit}>
        <div className="login-brand">
          <span className="logo-ring lg" />
          <div>
            <h1>Admin Portal</h1>
            <p className="muted">Knowledge Base für den Chatbot</p>
          </div>
        </div>
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
        <label className="field">
          <span>Passwort</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Anmelden…' : 'Anmelden'}
        </button>
        <p className="login-hint muted">
          Standard-Prompt bleibt im Backend; DB-Einträge werden nur ergänzend an den Chatbot angehängt.
        </p>
      </form>
    </div>
  );
}
