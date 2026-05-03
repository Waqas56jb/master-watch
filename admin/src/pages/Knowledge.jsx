import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { HiOutlinePlusSmall } from 'react-icons/hi2';
import { apiFetch } from '../api.js';
import { notify } from '../toast.js';

const emptyForm = () => ({
  title: '',
  slug: '',
  category: 'general',
  priority: '0',
  content: '',
  is_active: true,
});

export default function Knowledge() {
  const [items, setItems] = useState([]);
  const [kbQ, setKbQ] = useState('');
  const [loading, setLoading] = useState(true);

  const filteredKb = useMemo(() => {
    const k = kbQ.trim().toLowerCase();
    if (!k) return items;
    return items.filter(
      (it) =>
        String(it.title || '')
          .toLowerCase()
          .includes(k) ||
        String(it.category || '')
          .toLowerCase()
          .includes(k) ||
        String(it.excerpt || '')
          .toLowerCase()
          .includes(k)
    );
  }, [items, kbQ]);
  const [err, setErr] = useState('');
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setErr('');
    setLoading(true);
    try {
      const r = await apiFetch('/api/admin/knowledge');
      setItems(r.items || []);
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

  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      title: row.title,
      slug: row.slug || '',
      category: row.category || 'general',
      priority: String(row.priority ?? 0),
      content: '',
      is_active: row.is_active,
      _needsContent: true,
    });
    (async () => {
      try {
        const full = await apiFetch(`/api/admin/knowledge/${row.id}`);
        setForm((f) => ({ ...f, content: full.content || '', _needsContent: false }));
      } catch (e) {
        const m = e?.data?.error || e.message;
        setErr(m);
        notify.err(m);
      }
    })();
  }

  function startNew() {
    setEditingId('new');
    setForm(emptyForm());
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      const body = {
        title: form.title,
        slug: form.slug || null,
        category: form.category,
        priority: Number(form.priority) || 0,
        content: form.content,
        is_active: form.is_active,
      };
      if (editingId === 'new') {
        await apiFetch('/api/admin/knowledge', { method: 'POST', body: JSON.stringify(body) });
      } else if (editingId) {
        await apiFetch(`/api/admin/knowledge/${editingId}`, { method: 'PUT', body: JSON.stringify(body) });
      }
      setEditingId(null);
      setForm(emptyForm());
      await load();
      notify.ok('Wissensdatenbank gespeichert');
    } catch (ex) {
      const m = ex?.data?.error || ex.message;
      setErr(m);
      notify.err(m);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(id) {
    try {
      await apiFetch(`/api/admin/knowledge/${id}/toggle`, { method: 'PATCH', body: '{}' });
      await load();
      notify.ok('Status umgeschaltet');
    } catch (e) {
      const m = e?.data?.error || e.message;
      setErr(m);
      notify.err(m);
    }
  }

  async function remove(id) {
    if (!confirm('Eintrag wirklich löschen?')) return;
    try {
      await apiFetch(`/api/admin/knowledge/${id}`, { method: 'DELETE' });
      if (editingId === id) {
        setEditingId(null);
        setForm(emptyForm());
      }
      await load();
      notify.ok('Eintrag gelöscht');
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
          <h2>Wissensdatenbank</h2>
          <p className="muted">
            Zusätzliche Einträge aus der Datenbank — werden nach System-, Seiten- und CRM-Blöcken an den Prompt angehängt
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={startNew}>
          <HiOutlinePlusSmall size={22} style={{ marginRight: 6, verticalAlign: 'middle' }} aria-hidden />
          Neuer Eintrag
        </button>
      </div>

      {err ? <div className="banner-error">{err}</div> : null}

      <motion.div className="kb-shell glass" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
      <div className="kb-grid">
        <div className="kb-list glass">
          <div className="kb-list-head row">
            <strong>Einträge</strong>
            <input
              type="search"
              className="kb-search-input"
              placeholder="Suche…"
              value={kbQ}
              onChange={(e) => setKbQ(e.target.value)}
              aria-label="Knowledge durchsuchen"
            />
            {loading ? (
              <span className="muted">Lädt…</span>
            ) : (
              <span className="muted">
                {kbQ.trim() ? `${filteredKb.length} von ${items.length}` : `${items.length}`}
              </span>
            )}
          </div>
          <div className="kb-rows">
            {filteredKb.map((it) => (
              <button
                type="button"
                key={it.id}
                className={`kb-row ${editingId === it.id ? 'active' : ''}`}
                onClick={() => startEdit(it)}
              >
                <div className="kb-row-top">
                  <span className={`dot ${it.is_active ? 'on' : 'off'}`} title={it.is_active ? 'Aktiv' : 'Inaktiv'} />
                  <span className="kb-title">{it.title}</span>
                </div>
                <div className="kb-meta muted">
                  {it.category} · Prio {it.priority}
                </div>
              </button>
            ))}
            {!filteredKb.length && !loading ? <div className="muted pad">Keine Treffer oder noch leer.</div> : null}
          </div>
        </div>

        <form className="kb-form glass" onSubmit={save}>
          <h3>{editingId === 'new' ? 'Neu' : editingId ? 'Bearbeiten' : 'Auswahl'}</h3>
          {!editingId ? (
            <p className="muted">Wähle links einen Eintrag oder lege einen neuen an.</p>
          ) : (
            <>
              <div className="form-grid">
                <label className="field">
                  <span>Titel *</span>
                  <input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    required
                    maxLength={512}
                  />
                </label>
                <label className="field">
                  <span>Kurzname (URL)</span>
                  <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="freiwillig" />
                </label>
                <label className="field">
                  <span>Kategorie</span>
                  <input
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    placeholder="z. B. preise, versand, faq"
                  />
                </label>
                <label className="field">
                  <span>Priorität</span>
                  <input
                    type="number"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  />
                </label>
              </div>
              <label className="field">
                <span>Inhalt * (Text mit einfachen Formatierungen möglich)</span>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  rows={14}
                  required
                  placeholder="Neue Produktinfos, geänderte Richtlinien, FAQ-Ergänzungen..."
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                <span>Aktiv (sichtbar für Chatbot)</span>
              </label>
              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Speichern…' : 'Speichern'}
                </button>
                {editingId && editingId !== 'new' ? (
                  <>
                    <button type="button" className="btn-secondary" onClick={() => toggle(editingId)}>
                      Aktivierung umschalten
                    </button>
                    <button type="button" className="btn-danger" onClick={() => remove(editingId)}>
                      Löschen
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyForm());
                  }}
                >
                  Abbrechen
                </button>
              </div>
            </>
          )}
        </form>
      </div>
      </motion.div>
    </div>
  );
}
