import { useId, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineCheckCircle, HiOutlineEnvelope, HiOutlineKey } from 'react-icons/hi2';
import { useAuth } from '../AuthContext.jsx';
import { apiFetch } from '../api.js';
import PasswordField from '../components/PasswordField.jsx';
import AuthShell from '../components/AuthShell.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import { notify } from '../toast.js';

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
      notify.ok('E-Mail bestätigt — neues Passwort setzen');
    } catch (e2) {
      const m = e2?.data?.error || e2.message || 'E-Mail konnte nicht geprüft werden';
      setErr(m);
      notify.err(m);
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
      setEmail('');
      setVerifiedEmail('');
      setResetToken('');
      setNewPassword('');
      setConfirm('');
      setStep(1);
      notify.ok('Passwort erfolgreich geändert');
    } catch (e2) {
      const m = e2?.data?.error || e2.message || 'Reset fehlgeschlagen';
      setErr(m);
      notify.err(m);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div className="auth-brand">
        <BrandLogo variant="auth" aria-hidden />
        <div>
          <h1>Passwort zurücksetzen</h1>
          <p className="muted">Sicherer Ablauf in zwei Schritten</p>
        </div>
      </div>

      {!ok ? (
        <div className="auth-steps" aria-label="Fortschritt">
          <div className={`auth-step ${step === 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`} title="Schritt 1">
            <HiOutlineEnvelope size={18} aria-hidden />
          </div>
          <div className="auth-step-line" />
          <div className={`auth-step ${step === 2 ? 'active' : ''}`} title="Schritt 2">
            <HiOutlineKey size={18} aria-hidden />
          </div>
        </div>
      ) : null}

      <AnimatePresence mode="wait">
        {ok ? (
          <motion.div
            key="success"
            className="auth-success"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          >
            <div className="auth-success-ring">
              <HiOutlineCheckCircle size={36} aria-hidden />
            </div>
            <h2>Passwort aktualisiert</h2>
            <p className="muted" style={{ margin: 0, maxWidth: 320 }}>
              Sie können sich jetzt mit dem neuen Passwort anmelden.
            </p>
            <Link to="/login" className="btn-primary" style={{ textAlign: 'center', textDecoration: 'none', marginTop: 8 }}>
              Zur Anmeldung
            </Link>
          </motion.div>
        ) : (
          <motion.div
            key="forms"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            {err ? <div className="banner-error">{err}</div> : null}

            {step === 1 ? (
              <form onSubmit={verifyEmail}>
                <p className="muted" style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.5 }}>
                  Zuerst die Admin-E-Mail bestätigen (wird in der Datenbank geprüft).
                </p>
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
                <motion.button
                  type="submit"
                  className="btn-primary"
                  disabled={loading}
                  whileTap={{ scale: 0.98 }}
                  style={{ width: '100%', marginTop: 4 }}
                >
                  {loading ? 'Prüfen…' : 'E-Mail prüfen'}
                </motion.button>
              </form>
            ) : (
              <form onSubmit={submitNewPassword}>
                <p className="muted" style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.5 }}>
                  Neues Passwort für <strong style={{ color: 'var(--text)' }}>{verifiedEmail}</strong>
                </p>
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
                <motion.button
                  type="submit"
                  className="btn-primary"
                  disabled={loading}
                  whileTap={{ scale: 0.98 }}
                  style={{ width: '100%', marginTop: 4 }}
                >
                  {loading ? 'Speichern…' : 'Passwort speichern'}
                </motion.button>
                <button
                  type="button"
                  className="btn-secondary reset-back-btn"
                  onClick={goBackToEmail}
                  disabled={loading}
                >
                  Andere E-Mail
                </button>
              </form>
            )}

            <div className="auth-links-row">
              <Link to="/login">Zur Anmeldung</Link>
            </div>
            <p className="auth-footnote">Schritt 2 ist ca. 15 Minuten gültig — danach bitte erneut beginnen.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthShell>
  );
}
