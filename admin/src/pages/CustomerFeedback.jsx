import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { apiFetch } from '../api.js';
import CrmToolbar from '../components/CrmToolbar.jsx';
import CrmDataShell from '../components/CrmDataShell.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { notify } from '../toast.js';

function fmtDt(v) {
  if (!v) return '–';
  try {
    return new Date(v).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '–';
  }
}

function Stars({ n }) {
  const v = Number(n);
  const out = [];
  for (let i = 1; i <= 5; i += 1) out.push(<span key={i}>{i <= v ? '★' : '☆'}</span>);
  return <span className="star-rate">{out}</span>;
}

export default function CustomerFeedback() {
  const [q, setQ] = useState('');
  const [rating, setRating] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (rating) p.set('rating', rating);
    return p.toString();
  }, [q, rating]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await apiFetch(`/api/admin/feedback${params ? `?${params}` : ''}`);
      setItems(r.items || []);
    } catch (e) {
      const m = e?.data?.error || e.message;
      setErr(m);
      notify.err(m);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id) {
    if (!window.confirm('Diesen Bewertungseintrag wirklich löschen?')) return;
    try {
      await apiFetch(`/api/admin/feedback/${id}`, { method: 'DELETE' });
      await load();
      notify.ok('Bewertung entfernt');
    } catch (e) {
      const m = e?.data?.error || e.message;
      setErr(m);
      notify.err(m);
    }
  }

  return (
    <div className="page">
      <div className="page-head row">
        <div>
          <h2 className="page-head-title">Kundenfeedback</h2>
          <p className="muted">Bewertungen &amp; Verbesserungsvorschläge aus dem Chat</p>
        </div>
      </div>

      {err ? <div className="banner-error">{err}</div> : null}

      <CrmDataShell
        toolbar={
          <CrmToolbar embedded value={q} onChange={(v) => setQ(v)} placeholder="Kommentar, Vorschlag, E-Mail…">
            <select className="crm-select" value={rating} onChange={(e) => setRating(e.target.value)}>
              <option value="">Alle Sterne</option>
              <option value="5">5★</option>
              <option value="4">4★</option>
              <option value="3">3★</option>
              <option value="2">2★</option>
              <option value="1">1★</option>
            </select>
          </CrmToolbar>
        }
      >
        {loading ? (
          <div className="crm-loading">
            <span className="crm-spinner" aria-hidden />
            Daten werden geladen…
          </div>
        ) : !items?.length ? (
          <EmptyState title="Noch keine Bewertungen" hint="Sterne und Kommentare aus dem Chatbot erscheinen hier." />
        ) : (
          <motion.div className="table-scroll" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bewertung</th>
                  <th>Kommentar</th>
                  <th>Vorschlag</th>
                  <th>E-Mail</th>
                  <th>Datum</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(items || []).map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Stars n={row.rating} /> <span className="muted">{row.rating}/5</span>
                    </td>
                    <td>{row.comment || '–'}</td>
                    <td>{row.suggestion || '–'}</td>
                    <td className="mono-sm">{row.email || '–'}</td>
                    <td className="muted">{fmtDt(row.created_at)}</td>
                    <td>
                      <button type="button" className="btn-danger btn-tiny" onClick={() => remove(row.id)}>
                        Löschen
                      </button>
                    </td>
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
