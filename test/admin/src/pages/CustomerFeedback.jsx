import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { apiFetch } from '../api.js';
import CrmToolbar from '../components/CrmToolbar.jsx';

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
      setErr(e?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id) {
    if (!window.confirm('Dieses Feedback löschen?')) return;
    try {
      await apiFetch(`/api/admin/feedback/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setErr(e?.data?.error || e.message);
    }
  }

  return (
    <div className="page">
      <div className="page-head row">
        <div>
          <h2 className="page-head-title">
            <Sparkles className="page-ico-inline" size={26} strokeWidth={1.75} aria-hidden />
            Kundenfeedback
          </h2>
          <p className="muted">Bewertungen & Verbesserungsvorschläge aus dem Chat</p>
        </div>
      </div>

      {err ? <div className="banner-error">{err}</div> : null}

      <CrmToolbar value={q} onChange={(v) => setQ(v)} placeholder="Kommentar, Vorschlag, E-Mail…">
        <select className="crm-select" value={rating} onChange={(e) => setRating(e.target.value)}>
          <option value="">Alle Sterne</option>
          <option value="5">5★</option>
          <option value="4">4★</option>
          <option value="3">3★</option>
          <option value="2">2★</option>
          <option value="1">1★</option>
        </select>
      </CrmToolbar>

      {loading ? <div className="muted padded">Lädt…</div> : null}

      {!loading && (
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
          {!items?.length ? <div className="muted padded">Noch kein Feedback.</div> : null}
        </motion.div>
      )}
    </div>
  );
}
