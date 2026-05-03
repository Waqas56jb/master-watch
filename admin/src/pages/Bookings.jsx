import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
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

export default function Bookings() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [notesDraft, setNotesDraft] = useState({});
  const [savingId, setSavingId] = useState(null);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (status) p.set('status', status);
    return p.toString();
  }, [q, status]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await apiFetch(`/api/admin/bookings${params ? `?${params}` : ''}`);
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

  async function patch(id, payload) {
    setSavingId(id);
    try {
      await apiFetch(`/api/admin/bookings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      await load();
      notify.ok('Änderung gespeichert');
    } catch (e) {
      const m = e?.data?.error || e.message;
      setErr(m);
      notify.err(m);
    } finally {
      setSavingId(null);
    }
  }

  async function saveNotes(id) {
    const text = notesDraft[id];
    await patch(id, { notes: text ?? '' });
  }

  return (
    <div className="page">
      <div className="page-head row">
        <div>
          <h2 className="page-head-title">Online-Buchungen</h2>
          <p className="muted">Reservierungen aus dem Chat</p>
        </div>
      </div>

      {err ? <div className="banner-error">{err}</div> : null}

      <CrmDataShell
        toolbar={
          <CrmToolbar embedded value={q} onChange={(v) => setQ(v)} placeholder="Modell, Name, E-Mail…">
            <select className="crm-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Alle Status</option>
              <option value="pending">Ausstehend</option>
              <option value="confirmed">Bestätigt</option>
              <option value="done">Erledigt</option>
              <option value="cancelled">Abgebrochen</option>
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
          <EmptyState title="Keine Buchungen" hint="Neue Anfragen erscheinen hier, sobald Kunden über den Chat buchen." />
        ) : (
          <motion.div className="table-scroll" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Modell</th>
                  <th>Menge · Stufe</th>
                  <th>Kunde</th>
                  <th>Status</th>
                  <th>Datum</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(items || []).map((row) => {
                  const openRow = expanded === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr>
                        <td>{row.watch_model}</td>
                        <td>
                          ×{row.quantity}
                          {row.quality_tier ? ` · ${row.quality_tier}` : ''}
                        </td>
                        <td className="mono-sm">
                          {row.customer_name || '–'}
                          <br />
                          {row.email || '–'} {row.phone ? ` · ${row.phone}` : ''}
                        </td>
                        <td>
                          <select
                            className="crm-select-inline"
                            value={row.status}
                            disabled={savingId === row.id}
                            onChange={(e) => patch(row.id, { status: e.target.value })}
                          >
                            <option value="pending">Ausstehend</option>
                            <option value="confirmed">Bestätigt</option>
                            <option value="done">Erledigt</option>
                            <option value="cancelled">Abgebrochen</option>
                          </select>
                        </td>
                        <td className="muted">{fmtDt(row.created_at)}</td>
                        <td>
                          <button type="button" className="btn-ghost btn-tiny" onClick={() => setExpanded(openRow ? null : row.id)}>
                            {openRow ? 'Zu' : 'Details'}
                          </button>
                        </td>
                      </tr>
                      {openRow ? (
                        <tr>
                          <td colSpan={6} className="crm-detail-cell">
                            <div className="crm-detail-inner">
                              <div className="crm-meta-grid muted">
                                <span>
                                  Versand: {[row.shipping_address, row.postal_code, row.city, row.country].filter(Boolean).join(', ') || '–'}
                                </span>
                              </div>
                              <label className="field">
                                Buchungs-/Admin-Notiz
                                <textarea
                                  className="crm-notes"
                                  rows={3}
                                  value={notesDraft[row.id] !== undefined ? notesDraft[row.id] : row.notes || ''}
                                  onChange={(e) => setNotesDraft((prev) => ({ ...prev, [row.id]: e.target.value }))}
                                />
                              </label>
                              <button
                                type="button"
                                className="btn-primary btn-small"
                                disabled={savingId === row.id}
                                onClick={() => saveNotes(row.id)}
                              >
                                Notizen speichern
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </motion.div>
        )}
      </CrmDataShell>
    </div>
  );
}
