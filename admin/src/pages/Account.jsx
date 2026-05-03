import { useState } from 'react';
import { motion } from 'framer-motion';
import { apiFetch } from '../api.js';
import PasswordField from '../components/PasswordField.jsx';
import { notify } from '../toast.js';

export default function Account() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setOk(false);
    if (newPassword !== confirm) {
      setErr('Neue Passwörter stimmen nicht überein.');
      return;
    }
    if (newPassword.length < 8) {
      setErr('Neues Passwort: mindestens 8 Zeichen.');
      return;
    }
    setLoading(true);
    try {
      await apiFetch('/api/admin/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setOk(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      notify.ok('Passwort wurde aktualisiert');
    } catch (e2) {
      const m = e2?.data?.error || e2.message || 'Änderung fehlgeschlagen';
      setErr(m);
      notify.err(m);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-head-title-dash">Konto</h2>
        <p className="muted">Passwort ändern (angemeldet)</p>
      </div>
      <motion.div layout className="account-card glass" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        {ok ? <div className="banner-success">Passwort wurde aktualisiert.</div> : null}
        {err ? <div className="banner-error">{err}</div> : null}
        <form onSubmit={submit} className="account-form">
          <PasswordField
            label="Aktuelles Passwort"
            id="acct-current"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <PasswordField
            label="Neues Passwort (≥ 8 Zeichen)"
            id="acct-new"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
          />
          <PasswordField
            label="Neues Passwort bestätigen"
            id="acct-confirm"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
          />
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Speichern…' : 'Passwort ändern'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
