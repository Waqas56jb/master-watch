import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { apiFetch } from '../api.js';
import CrmDataShell from '../components/CrmDataShell.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { notify } from '../toast.js';

function fmtDt(v) {
  if (!v) return '–';
  try {
    return new Date(v).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' });
  } catch {
    return '–';
  }
}

const PAGE = 50;

export default function ChatActivity() {
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await apiFetch(`/api/admin/chat-events?limit=${PAGE}&offset=${offset}`);
      setItems(r.items || []);
      setTotal(Number(r.total) || 0);
    } catch (e) {
      const m = e?.data?.error || e.message;
      setErr(m);
      setItems([]);
      notify.err(m);
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    load();
  }, [load]);

  const page = Math.floor(offset / PAGE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="page">
      <div className="page-head row">
        <div>
          <h2 className="page-head-title">Chat-Aktivität</h2>
          <p className="muted">
            Einträge aus <code>chat_events</code> (je Aufruf von <code>/chat</code>: Zeichenlänge der letzten Nutzernachricht)
          </p>
        </div>
      </div>

      {err ? <div className="banner-error">{err}</div> : null}

      <div className="chat-pager-bar">
        <span className="muted">
          Gesamt: <strong>{total}</strong> · Seite {page} / {pages}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button type="button" className="btn-ghost" disabled={offset <= 0 || loading} onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>
            Zurück
          </button>
          <button type="button" className="btn-ghost" disabled={offset + PAGE >= total || loading} onClick={() => setOffset((o) => o + PAGE)}>
            Weiter
          </button>
        </span>
      </div>

      <CrmDataShell toolbar={null}>
        {loading ? (
          <div className="crm-loading">
            <span className="crm-spinner" aria-hidden />
            Daten werden geladen…
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="Keine Chat-Events" hint="Sobald Nutzer den Chatbot verwenden, erscheinen Einträge hier." />
        ) : (
          <motion.div className="table-scroll" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Zeitpunkt</th>
                  <th>Nutzer-Nachricht (Zeichen)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td className="mono-sm">{row.id}</td>
                    <td className="muted">{fmtDt(row.occurred_at)}</td>
                    <td>{row.user_message_chars ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </CrmDataShell>
    </div>
  );
}
