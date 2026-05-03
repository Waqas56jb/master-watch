import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { apiFetch } from '../api.js';
import { notify } from '../toast.js';

export default function ChatbotPromptGlobal() {
  const [global_instructions, setGlobal] = useState('');
  const [crm_tools_instructions, setCrm] = useState('');
  const [updated_at, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    setLoading(true);
    try {
      const row = await apiFetch('/api/admin/chatbot-prompt');
      setGlobal(row.global_instructions || '');
      setCrm(row.crm_tools_instructions || '');
      setUpdatedAt(row.updated_at || null);
    } catch (e) {
      const m = e?.data?.error || e.message;
      setErr(m);
      notify.err(m);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await apiFetch('/api/admin/chatbot-prompt', {
        method: 'PUT',
        body: JSON.stringify({ global_instructions, crm_tools_instructions }),
      });
      notify.ok('System-Prompt gespeichert');
      await load();
    } catch (ex) {
      const m = ex?.data?.error || ex.message;
      setErr(m);
      notify.err(m);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head row">
        <div>
          <h2>Chatbot – System &amp; CRM</h2>
          <p className="muted">
            Hauptanweisungen (Rolle, Ton, Fakten) und separater CRM-/Werkzeug-Block. Reihenfolge zur Laufzeit:{' '}
            <strong>System</strong> → optional <strong>Seiten-Wissen</strong> → <strong>Wissensdatenbank</strong> →{' '}
            <strong>CRM-Anhang</strong> (nur wenn Datenbank aktiv).
          </p>
          {updated_at ? (
            <p className="muted mono-sm" style={{ marginTop: 6 }}>
              Zuletzt gespeichert: {new Date(updated_at).toLocaleString('de-DE')}
            </p>
          ) : null}
        </div>
      </div>

      {err ? <div className="banner-error">{err}</div> : null}

      <motion.div
        className="kb-shell glass"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
      >
        <form className="kb-form glass" onSubmit={save} style={{ maxWidth: '100%' }}>
          {loading ? (
            <p className="muted">Lädt…</p>
          ) : (
            <>
              <label className="field">
                <span>Globale Systemanweisungen *</span>
                <textarea
                  value={global_instructions}
                  onChange={(e) => setGlobal(e.target.value)}
                  rows={20}
                  placeholder="Rolle des Assistenten, Shop-Fakten, Verhalten, Format…"
                />
              </label>
              <label className="field">
                <span>CRM- &amp; Werkzeug-Anweisungen *</span>
                <p className="muted" style={{ margin: '0 0 8px', fontSize: '0.9rem' }}>
                  Regeln zu Buchungen, Support, Leads, Feedback und Markdown nach Tool-Aufrufen. Funktionsnamen
                  (submit_booking_request usw.) bitte unverändert lassen.
                </p>
                <textarea
                  value={crm_tools_instructions}
                  onChange={(e) => setCrm(e.target.value)}
                  rows={14}
                  placeholder="CRM-Block…"
                />
              </label>
              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Speichern…' : 'Speichern'}
                </button>
                <button type="button" className="btn-secondary" onClick={load} disabled={saving}>
                  Verwerfen &amp; neu laden
                </button>
              </div>
            </>
          )}
        </form>
      </motion.div>
    </div>
  );
}
