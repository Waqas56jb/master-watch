import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
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

export default function Contacts() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    return p.toString();
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await apiFetch(`/api/admin/contacts${qs ? `?${qs}` : ''}`);
      setItems(r.items || []);
    } catch (e) {
      setErr(e?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page">
      <div className="page-head row">
        <div>
          <h2 className="page-head-title">
            <Users className="page-ico-inline" size={26} strokeWidth={1.75} aria-hidden />
            Kontakte
          </h2>
          <p className="muted">E-Mail-Adressen aus Buchungen, Anfragen & Feedback · aggregiert</p>
        </div>
      </div>

      {err ? <div className="banner-error">{err}</div> : null}

      <CrmToolbar value={q} onChange={(v) => setQ(v)} placeholder="E-Mail suchen…" />

      {loading ? <div className="muted padded">Lädt…</div> : null}

      {!loading && (
        <motion.div className="table-scroll" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>E-Mail</th>
                <th>Kontaktpunkte</th>
                <th>Zuletzt aktiv</th>
              </tr>
            </thead>
            <tbody>
              {(items || []).map((row, i) => (
                <tr key={`${row.email}-${i}`}>
                  <td className="mono-sm">{row.email}</td>
                  <td>{row.touchpoints ?? '–'}</td>
                  <td className="muted">{fmtDt(row.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items?.length ? <div className="muted padded">Keine Kontakte.</div> : null}
        </motion.div>
      )}
    </div>
  );
}
