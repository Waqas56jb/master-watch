import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { HiOutlinePlusSmall } from 'react-icons/hi2';
import { apiFetch } from '../api.js';
import { notify } from '../toast.js';

const emptyForm = () => ({
  page_key: '',
  display_title: '',
  sort_order: '0',
  content: '',
  is_active: true,
});

export default function ChatbotPromptPages() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return items;
    return items.filter(
      (it) =>
        String(it.page_key || '')
          .toLowerCase()
          .includes(k) ||
        String(it.display_title || '')
          .toLowerCase()
          .includes(k) ||
        String(it.excerpt || '')
          .toLowerCase()
          .includes(k)
    );
  }, [items, q]);

  async function load() {
    setErr('');
    setLoading(true);
    try {
      const r = await apiFetch('/api/admin/chatbot-prompt/pages');
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
      page_key: row.page_key,
      display_title: row.display_title,
      sort_order: String(row.sort_order ?? 0),
      content: '',
      is_active: row.is_active,
      _needsContent: true,
    });
    (async () => {
      try {
        const full = await apiFetch(`/api/admin/chatbot-prompt/pages/${row.id}`);
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
        page_key: form.page_key,
        display_title: form.display_title,
        sort_order: Number(form.sort_order) || 0,
        content: form.content,
        is_active: form.is_active,
      };
      if (editingId === 'new') {
        await apiFetch('/api/admin/chatbot-prompt/pages', { method: 'POST', body: JSON.stringify(body) });
      } else if (editingId) {
        await apiFetch(`/api/admin/chatbot-prompt/pages/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      }
      setEditingId(null);
      setForm(emptyForm());
      await load();
      notify.ok('Seiten-Wissen gespeichert');
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
      await apiFetch(`/api/admin/chatbot-prompt/pages/${id}/toggle`, { method: 'PATCH', body: '{}' });
      await load();
      notify.ok('Status umgeschaltet');
    } catch (e) {
      const m = e?.data?.error || e.message;
      setErr(m);
      notify.err(m);
    }
  }

  async function remove(id) {
    if (!confirm('Diese Seite wirklich löschen?')) return;
    try {
      await apiFetch(`/api/admin/chatbot-prompt/pages/${id}`, { method: 'DELETE' });
      if (editingId === id) {
        setEditingId(null);
        setForm(emptyForm());
      }
      await load();
      notify.ok('Gelöscht');
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
          <h2>Chatbot – Seiten-Wissen</h2>
          <p className="muted">
            Zusätzliche thematische Blöcke (z. B. Versand, Startseite, Marke). Nur <strong>aktive</strong> Einträge mit
            Inhalt werden in den Systemprompt eingefügt — sortiert nach Sortierung.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={startNew}>
          <HiOutlinePlusSmall size={22} style={{ marginRight: 6, verticalAlign: 'middle' }} aria-hidden />
          Neue Seite
        </button>
      </div>

      {err ? <div className="banner-error">{err}</div> : null}

      <motion.div className="kb-shell glass" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
        <div className="kb-grid">
          <div className="kb-list glass">
            <div className="kb-list-head row">
              <strong>Seiten</strong>
              <input
                type="search"
                className="kb-search-input"
                placeholder="Suche…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Seiten durchsuchen"
              />
              {loading ? (
                <span className="muted">Lädt…</span>
              ) : (
                <span className="muted">{q.trim() ? `${filtered.length} von ${items.length}` : `${items.length}`}</span>
              )}
            </div>
            <div className="kb-rows">
              {filtered.map((it) => (
                <button
                  type="button"
                  key={it.id}
                  className={`kb-row ${editingId === it.id ? 'active' : ''}`}
                  onClick={() => startEdit(it)}
                >
                  <div className="kb-row-top">
                    <span className={`dot ${it.is_active ? 'on' : 'off'}`} title={it.is_active ? 'Aktiv' : 'Inaktiv'} />
                    <span className="kb-title">{it.display_title}</span>
                  </div>
                  <div className="kb-meta muted mono-sm">
                    {it.page_key} · Sort. {it.sort_order}
                  </div>
                </button>
              ))}
              {!filtered.length && !loading ? <div className="muted pad">Keine Treffer oder noch leer.</div> : null}
            </div>
          </div>

          <form className="kb-form glass" onSubmit={save}>
            <h3>{editingId === 'new' ? 'Neue Seite' : editingId ? 'Bearbeiten' : 'Auswahl'}</h3>
            {!editingId ? (
              <p className="muted">Links eine Seite wählen oder „Neue Seite“ anlegen.</p>
            ) : (
              <>
                <div className="form-grid">
                  <label className="field">
                    <span>Interner Schlüssel</span>
                    <input
                      value={form.page_key}
                      onChange={(e) => setForm({ ...form, page_key: e.target.value })}
                      maxLength={128}
                      placeholder="z. B. versand — leer = aus Anzeigename abgeleitet"
                    />
                  </label>
                  <label className="field">
                    <span>Anzeigename *</span>
                    <input
                      value={form.display_title}
                      onChange={(e) => setForm({ ...form, display_title: e.target.value })}
                      required
                      maxLength={200}
                    />
                  </label>
                  <label className="field">
                    <span>Sortierung</span>
                    <input
                      type="number"
                      value={form.sort_order}
                      onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Inhalt *</span>
                  <textarea
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                    rows={14}
                    required
                    placeholder="Text für diesen Bereich…"
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  />
                  <span>Aktiv</span>
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
