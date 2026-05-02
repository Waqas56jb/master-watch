import { useId, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { apiFetch } from '../api.js';
import PasswordField from '../components/PasswordField.jsx';

export default function ResetPassword() {
  const { isAuthed } = useAuth();
  const emailFieldId = useId();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  if (isAuthed) return <Navigate to="/dashboard" replace />;

  async function verifyEmail(e) {
    e.preventDefault();
    setErr('');
    setOk(false);
    setLoading(true);
    try {
      const data = await apiFetch('/api/admin/auth/verify-reset-email', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setVerifiedEmail(data.email || email.trim().toLowerCase());
      setResetToken(data.resetToken);
      setStep(2);
      setNewPassword('');
      setConfirm('');
    } catch (e2) {
      setErr(e2?.data?.error || e2.message || 'E-Mail konnte nicht geprüft werden');
    } finally {
      setLoading(false);
    }
  }

  function goBackToEmail() {
    setStep(1);
    setErr('');
    setResetToken('');
    setVerifiedEmail('');
    setNewPassword('');
    setConfirm('');
  }

  async function submitNewPassword(e) {
    e.preventDefault();
    setErr('');
    setOk(false);
    if (newPassword !== confirm) {
      setErr('Passwörter stimmen nicht überein.');
      return;
    }
    if (newPassword.length < 8) {
      setErr('Neues Passwort: mindestens 8 Zeichen.');
      return;
    }
    if (!resetToken) {
      setErr('Bitte starten Sie erneut mit Ihrer E-Mail.');
      setStep(1);
      return;
    }
    setLoading(true);
    try {
      await apiFetch('/api/admin/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: verifiedEmail,
          newPassword,
          resetToken,
        }),
      });
      setOk(true);
      setStep(1);
      setEmail('');
      setVerifiedEmail('');
      setResetToken('');
      setNewPassword('');
      setConfirm('');
    } catch (e2) {
      setErr(e2?.data?.error || e2.message || 'Reset fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-glow" />
      <div className="login-card glass">
        <div className="login-brand">
          <span className="logo-ring lg" />
          <div>
            <h1>Passwort zurücksetzen</h1>
            <p className="muted">
              {step === 1
                ? 'Zuerst Ihre Admin-E-Mail bestätigen (wird in der Datenbank geprüft).'
                : `Neues Passwort für ${verifiedEmail}`}
            </p>
          </div>
        </div>

        {ok ? (
          <div className="banner-success">Passwort wurde geändert. Sie können sich jetzt anmelden.</div>
        ) : null}
        {err ? <div className="banner-error">{err}</div> : null}

        {step === 1 ? (
          <form onSubmit={verifyEmail}>
            <label className="field">
              <span>E-Mail</span>
              <input
                id={emailFieldId}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@firma.de"
                required
              />
            </label>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Prüfen…' : 'E-Mail prüfen'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitNewPassword}>
            <PasswordField
              label="Neues Passwort (≥ 8 Zeichen)"
              id="reset-new"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
            />
            <PasswordField
              label="Neues Passwort bestätigen"
              id="reset-confirm"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
            />
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Speichern…' : 'Passwort speichern'}
            </button>
            <button type="button" className="btn-secondary reset-back-btn" onClick={goBackToEmail} disabled={loading}>
              Andere E-Mail
            </button>
          </form>
        )}

        <p className="login-links">
          <Link to="/login">Zur Anmeldung</Link>
        </p>
        <p className="login-hint muted">
          Schritt 2 ist nur 15 Minuten gültig. Bei Ablauf bitte erneut mit E-Mail beginnen.
        </p>
      </div>
    </div>
  );
}
