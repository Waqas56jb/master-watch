import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { apiFetch } from '../api.js';

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
