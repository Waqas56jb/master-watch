import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { HiOutlineCloudArrowUp, HiOutlineSwatch } from 'react-icons/hi2';
import { apiFetch } from '../api.js';
import { notify } from '../toast.js';

const KEY_ORDER = [
  'surface',
  'card',
  'accent',
  'userBubble',
  'botBubble',
  'bg',
  'border',
  'text',
  'textDim',
];

/** Deutsche Anzeigenamen für Farbfelder (öffentliches Chatbot-Erscheinungsbild). */
const THEME_KEY_LABELS = {
  surface: 'App-Hintergrund',
  card: 'Kartenfläche',
  accent: 'Akzentfarbe',
  userBubble: 'Nutzer-Nachricht',
  botBubble: 'Bot-Antwort',
  bg: 'Seitenhintergrund',
  border: 'Rahmenfarbe',
  text: 'Schriftfarbe',
  textDim: 'Gedämpfte Schrift',
};

const HEX_SWATCH_GRID = [
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#22d3ee',
  '#38bdf8',
  '#0ea5e9',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#facc15',
  '#ffffff',
  '#e2e8f0',
  '#64748b',
  '#334155',
  '#0f172a',
];

function normalizeHex(hex) {
  let h = String(hex || '').replace('#', '').slice(0, 6).toLowerCase();
  const full = /^[0-9a-f]{6}$/.test(h) ? `#${h}` : null;
  if (full) return full;
  if (/^[0-9a-f]{3}$/.test(h)) return `#${h.split('').map((c) => c + c).join('')}`;
  return null;
}

/** Safe visual color for previews (fallback if user is mid-typing invalid hex). */
function previewBg(hex, fallback = '#374151') {
  return normalizeHex(hex) || fallback;
}

export default function ChatbotAppearance() {
  const [labels, setLabels] = useState({});
  const [theme, setTheme] = useState({});
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await apiFetch('/api/admin/theme');
      setTheme(r.theme || {});
      setLabels(r.labels || r.components || {});
      setPresets(r.presets || []);
    } catch (e) {
      const m = e?.data?.error || e.message;
      setErr(m);
      notify.err(m);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateKeyRaw(k, v) {
    let h = String(v || '').trim();
    if (!h.startsWith('#')) h = `#${h}`;
    h = h.slice(0, 7);
    setTheme((prev) => ({ ...prev, [k]: h }));
  }

  function normalizeThemeForSave(raw) {
    const out = { ...raw };
    for (const k of Object.keys(out)) {
      const ok = normalizeHex(out[k]);
      if (ok) out[k] = ok;
      else delete out[k];
    }
    return out;
  }

  async function saveAll() {
    setSaving(true);
    setOkMsg('');
    try {
      const toSend = normalizeThemeForSave(theme);
      const r = await apiFetch('/api/admin/theme', { method: 'PUT', body: JSON.stringify({ theme: toSend }) });
      setTheme(r.theme || theme);
      setOkMsg('Gespeichert — wird beim nächsten Besuch im Chat-Widget geladen.');
      notify.ok('Darstellung gespeichert');
    } catch (e) {
      const m = e?.data?.error || e.message;
      setErr(m);
      notify.err(m);
    } finally {
      setSaving(false);
    }
  }

  function applyPreset(t) {
    setTheme({ ...t });
    setOkMsg('Vorschau im Editor — noch speichern für Live-Widget.');
    notify.info('Vorschau übernommen — bitte speichern');
  }

  const keys = KEY_ORDER;
  return (
    <div className="page chatbot-theme-page">
      <div className="page-head row">
        <div>
          <h2 className="page-head-title">
            <HiOutlineSwatch className="page-ico-inline" size={26} aria-hidden />
            Chatbot-Erscheinungsbild
          </h2>
          <p className="muted">
            Farben je Bereich als Hex-Wert und per Schnellwahl. Die Konfiguration ist öffentlich unter dem Endpunkt{' '}
            <code className="muted">/api/public/chatbot-theme</code> (nur Lesen) erreichbar.
          </p>
        </div>
        <button type="button" className="btn-primary theme-save-main" disabled={saving || loading} onClick={saveAll}>
          <HiOutlineCloudArrowUp size={20} aria-hidden /> Speichern
        </button>
      </div>

      {err ? <div className="banner-error">{err}</div> : null}
      {okMsg ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="banner-ok glass">
          {okMsg}
        </motion.div>
      ) : null}

      {!loading ? (
        <>
          <div className="theme-presets glass">
            <h3 className="theme-section-title">Schnellvorlagen</h3>
            <div className="theme-preset-buttons">
              {presets.map((p) => (
                <motion.button
                  key={p.name}
                  type="button"
                  className="preset-chip"
                  onClick={() => applyPreset(p.theme)}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    borderColor: (p.theme && p.theme.accent) || 'var(--border)',
                  }}
                >
                  <span
                    className="preset-dot"
                    style={{
                      background: `linear-gradient(135deg,${p.theme?.accent || '#22c55e'},${p.theme?.surface || '#111'})`,
                    }}
                  />
                  {p.name}
                </motion.button>
              ))}
            </div>
          </div>

          <div className="theme-editor-grid">
            {keys.map((key) => {
              const rawHex = theme[key] != null ? String(theme[key]) : '#000000';
              const canon = normalizeHex(rawHex);
              const label = THEME_KEY_LABELS[key] || labels[key] || key;
              return (
                <motion.article
                  key={key}
                  className="theme-card glass"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="theme-card-head">
                    <div className="theme-chip-name">{label}</div>
                    <div className="theme-chip-label muted mono-sm">{key}</div>
                  </div>
                  <div className="theme-card-body">
                    <div className="theme-color-big" style={{ background: previewBg(rawHex, '#475569') }}>
                      <input
                        type="color"
                        className="theme-color-native"
                        value={canon ? canon.toLowerCase() : '#475569'}
                        onChange={(e) => updateKeyRaw(key, e.target.value)}
                        aria-label={`Farbe für ${label}`}
                      />
                    </div>
                    <div className="hex-row">
                      <span className="mono-sm hex-label">Hex</span>
                      <input
                        type="text"
                        className="hex-input mono-sm"
                        value={rawHex}
                        onChange={(e) => updateKeyRaw(key, e.target.value)}
                        onBlur={() => {
                          const n = normalizeHex(rawHex);
                          if (n) setTheme((prev) => ({ ...prev, [key]: n }));
                        }}
                        spellCheck={false}
                      />
                    </div>
                    <div className="hex-micro-grid">
                      {HEX_SWATCH_GRID.map((c) => (
                        <button
                          key={`${key}-${c}`}
                          type="button"
                          className="hex-micro"
                          title={c}
                          style={{
                            background: c,
                            boxShadow:
                              canon &&
                              canon.toLowerCase() === c.toLowerCase()
                                ? 'inset 0 0 0 2px #fff'
                                : undefined,
                          }}
                          onClick={() => updateKeyRaw(key, c)}
                        />
                      ))}
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </>
      ) : (
        <div className="muted padded">Lädt Darstellung…</div>
      )}
    </div>
  );
}
