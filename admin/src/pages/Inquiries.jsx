import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquareText } from 'lucide-react';
import { apiFetch } from '../api.js';
import CrmToolbar from '../components/CrmToolbar.jsx';

function fmtDt(v) {
  if (!v) return '–';
  try {
    const d = new Date(v);
    return d.toLocaleString('de-DE', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return '–';
  }
}

export default function Inquiries() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
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
    if (type) p.set('type', type);
    return p.toString();
  }, [q, status, type]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await apiFetch(`/api/admin/inquiries${params ? `?${params}` : ''}`);
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

  async function patch(id, payload) {
    setSavingId(id);
    try {
      await apiFetch(`/api/admin/inquiries/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      await load();
    } catch (e) {
      setErr(e?.data?.error || e.message);
    } finally {
      setSavingId(null);
    }
  }

  async function saveNotes(id) {
    const text = notesDraft[id];
    await patch(id, { admin_notes: text ?? '' });
  }

  return (
    <div className="page">
      <div className="page-head row">
        <div>
          <h2 className="page-head-title">
            <MessageSquareText className="page-ico-inline" size={26} strokeWidth={1.75} aria-hidden />
            <span>Anfragen & Support</span>
          </h2>
          <p className="muted">Leads, Support-Tickets · Status & Team-Notizen</p>
        </div>
      </div>

      {err ? <div className="banner-error">{err}</div> : null}

      <CrmToolbar value={q} onChange={(v) => setQ(v)} placeholder="Suche Nachricht, E-Mail…">
        <select className="crm-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Alle Status</option>
          <option value="open">Offen</option>
          <option value="resolved">Gelöst</option>
          <option value="archived">Archiv</option>
        </select>
        <select className="crm-select" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Alle Typen</option>
          <option value="support">Support</option>
          <option value="lead">Lead</option>
          <option value="general">Allgemein</option>
        </select>
      </CrmToolbar>

      {loading ? <div className="muted padded">Lädt…</div> : null}

      {!loading && (
        <motion.div className="table-scroll" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Typ</th>
                <th>Betreff / Kurzinfo</th>
                <th>Kontakt</th>
                <th>Status</th>
                <th>Datum</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(items || []).map((row) => {
                const subj = row.subject || row.message?.slice(0, 72) || '–';
                const openRow = expanded === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr>
                      <td>
                        <span className={`pill-mini type-${row.inquiry_type}`}>{row.inquiry_type}</span>
                      </td>
                      <td>{subj}</td>
                      <td className="mono-sm">
                        {row.email || '–'}
                        {row.phone ? (
                          <>
                            <br />
                            {row.phone}
                          </>
                        ) : null}
                      </td>
                      <td>
                        <select
                          className="crm-select-inline"
                          value={row.status}
                          disabled={savingId === row.id}
                          onChange={(e) => patch(row.id, { status: e.target.value })}
                        >
                          <option value="open">Offen</option>
                          <option value="resolved">Gelöst</option>
                          <option value="archived">Archiv</option>
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
                      <tr key={`${row.id}-d`}>
                        <td colSpan={6} className="crm-detail-cell">
                          <div className="crm-detail-inner">
                            <p className="crm-msg">{row.message}</p>
                            <div className="crm-meta-grid muted">
                              {row.customer_name ? <span>Name: {row.customer_name}</span> : null}
                              {(row.address_line || row.city) ? (
                                <span>
                                  Adresse/Ort:{' '}
                                  {[row.address_line, row.postal_code, row.city, row.country].filter(Boolean).join(', ') || '–'}
                                </span>
                              ) : null}
                            </div>
                            <label className="field">
                              Admin-Notiz
                              <textarea
                                className="crm-notes"
                                rows={3}
                                value={
                                  notesDraft[row.id] !== undefined ? notesDraft[row.id] : row.admin_notes || ''
                                }
                                onChange={(e) =>
                                  setNotesDraft((prev) => ({ ...prev, [row.id]: e.target.value }))
                                }
                                placeholder="Interne Notiz…"
                              />
                            </label>
                            <button
                              type="button"
                              className="btn-primary btn-small"
                              disabled={savingId === row.id}
                              onClick={() => saveNotes(row.id)}
                            >
                              Notiz speichern
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
          {!items?.length ? <div className="muted padded">Keine Einträge.</div> : null}
        </motion.div>
      )}
    </div>
  );
}
