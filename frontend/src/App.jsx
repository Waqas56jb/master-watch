import { useCallback, useEffect, useRef, useState } from 'react';
import MarkdownBubble from './MarkdownBubble.jsx';

/**
 * API-Basis für Chat und Theme:
 * - Vite-Entwicklung: `VITE_API_URL` leer → relative URLs → Proxy zum lokalen Backend.
 * - Produktionsbundle auf localhost:3000 (Monolith): eingebettete `VITE_API_URL` ignorieren → gleiche Quelle `/chat`.
 * - Vorschau auf anderem localhost-Port: lokales Backend (Port 3000).
 * - Echtes Deployment: `VITE_API_URL` setzen, wenn Widget und API unterschiedliche Domains haben.
 */
const DEFAULT_LOCAL_API = 'http://127.0.0.1:3000';

function isLoopbackHostname(hostname) {
  if (!hostname) return false;
  const h = String(hostname).toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

function stripRemoteWhenLocalhost(origin) {
  if (typeof window === 'undefined') return origin;
  if (!isLoopbackHostname(window.location.hostname)) return origin;
  const o = String(origin || '').trim();
  if (!o) return o;
  try {
    const u = new URL(o);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return origin;
    return '';
  } catch {
    return origin;
  }
}

function getApiRoot() {
  const env = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');

  if (import.meta.env.DEV) {
    return stripRemoteWhenLocalhost(env);
  }

  // Produktionsbundle: auf Loopback keine eingebettete Remote-`VITE_API_URL` verwenden.
  if (typeof window !== 'undefined' && isLoopbackHostname(window.location.hostname)) {
    const port = String(window.location.port || '');
    if (port === '3000') return '';
    return DEFAULT_LOCAL_API;
  }

  if (env) return env;
  return '';
}

function getChatUrl() {
  const r = getApiRoot();
  return r ? `${r}/chat` : '/chat';
}

function getThemeUrl() {
  const r = getApiRoot();
  return r ? `${r}/api/public/chatbot-theme` : '/api/public/chatbot-theme';
}

const CHAT_STORAGE = 'mw_chat_state_v3';
const HISTORY_CAP = 20;

const WELCOME_MARKDOWN = `Willkommen bei **MisterWatch**! 👋

Ich helfe dir bei **Uhren**, **Buchungen**, **Kundendienst** und mehr.

Du kannst:
- 📦 eine **Reservierung oder Buchung** anfragen
- 💬 den **Kundendienst** erreichen oder eine **geschäftliche Anfrage** stellen
- ⭐ eine **Bewertung** hinterlassen

**Womit kann ich dir helfen?**`;

const QUICK_ACTIONS = [
  {
    label: '📲Bestellung aufgeben',
    text: 'Ich möchte eine Bestellung aufgeben. Welche Angaben benötigt ihr von mir?',
  },
  { label: '💬 Kundendienst', text: 'Ich habe ein Problem und benötige Hilfe vom Kundendienst.' },
  { label: '⭐ Bewertung', text: 'Ich möchte eine Bewertung zum Shop abgeben.' },
  { label: '🏅 Qualitäten', text: 'Welche Qualitätsstufen gibt es?' },
  { label: '💰 Preise', text: 'Was kosten eure Uhren?' },
  { label: '🚚Lieferzeit', text: 'Wie lange dauert die Lieferung?' },
  { label: '💳 Zahlung', text: 'Welche Zahlungsarten bietet ihr an?' },
];

function rgbFromHex(hex) {
  const raw = String(hex || '').replace('#', '');
  if (!raw) return { r: 34, g: 197, b: 94 };
  const h = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw.padEnd(6, '0').slice(0, 6);
  const n = Number.parseInt(h, 16);
  if (!Number.isFinite(n)) return { r: 34, g: 197, b: 94 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function applyThemeToRoot(theme) {
  const root = document.documentElement;
  if (!theme || typeof theme !== 'object') return;
  const t = theme;
  root.style.setProperty('--bg', t.bg ?? '#0a0a0a');
  root.style.setProperty('--surface', t.surface ?? '#111111');
  root.style.setProperty('--card', t.card ?? '#181818');
  root.style.setProperty('--border', t.border ?? '#2a2a2a');
  root.style.setProperty('--accent', t.accent ?? '#22c55e');
  root.style.setProperty('--text', t.text ?? '#f5f5f5');
  root.style.setProperty('--text-dim', t.textDim ?? '#888888');
  root.style.setProperty('--user-bubble', t.userBubble ?? '#22c55e');
  root.style.setProperty('--bot-bubble', t.botBubble ?? '#1e1e1e');
  const { r, g, b } = rgbFromHex(t.accent);
  root.style.setProperty('--accent-dim', `rgba(${r},${g},${b},0.14)`);
  root.style.setProperty('--accent-glow', `rgba(${r},${g},${b},0.35)`);
  root.style.setProperty('--accent-soft-bg-1', `rgba(${r},${g},${b},0.06)`);
  root.style.setProperty('--accent-soft-bg-2', `rgba(${r},${g},${b},0.04)`);
  root.style.setProperty('--accent-soft-ring', `rgba(${r},${g},${b},0.08)`);
  root.style.setProperty('--md-a-border', `rgba(${r},${g},${b},0.35)`);
}

function persistChat(entries, history) {
  try {
    const hist = Array.isArray(history) ? history.slice(-HISTORY_CAP * 2) : [];
    const ent = Array.isArray(entries) ? entries.slice(-60) : [];
    sessionStorage.setItem(CHAT_STORAGE, JSON.stringify({ entries: ent, history: hist }));
  } catch {
    /* ignore quota */
  }
}

function getTime() {
  return new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function getSpeechRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export default function App() {
  const [welcomeTime] = useState(() => getTime());
  const [showQuickReplies, setShowQuickReplies] = useState(true);
  const [entries, setEntries] = useState([]);
  const [input, setInput] = useState('');
  const [isWaiting, setIsWaiting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const conversationHistoryRef = useRef([]);
  const messagesAreaRef = useRef(null);
  const textareaRef = useRef(null);
  const hydratedRef = useRef(false);
  const recognitionRef = useRef(null);

  const speechSupported =
    typeof window !== 'undefined' && Boolean(getSpeechRecognitionCtor());

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop?.();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = messagesAreaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [entries, isWaiting, showQuickReplies, scrollToBottom]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await fetch(getThemeUrl());
        const data = await r.json();
        if (!cancel && data.theme) applyThemeToRoot(data.theme);
      } catch {
        applyThemeToRoot({});
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    try {
      const raw = sessionStorage.getItem(CHAT_STORAGE);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (Array.isArray(s.history) && s.history.length) {
        conversationHistoryRef.current = s.history.filter(
          (m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
        );
      }
      if (Array.isArray(s.entries) && s.entries.length) {
        setEntries(s.entries);
        setShowQuickReplies(false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const sendMessage = useCallback(
    async (forcedText) => {
      const raw = forcedText !== undefined ? forcedText : input;
      const text = (typeof raw === 'string' ? raw : input).trim();
      if (!text || isWaiting) return;

      setInput('');
      setShowQuickReplies(false);

      const userTime = getTime();
      conversationHistoryRef.current = [
        ...conversationHistoryRef.current,
        { role: 'user', content: text },
      ].slice(-HISTORY_CAP);

      setEntries((prev) => {
        const next = [...prev, { role: 'user', text, time: userTime }];
        persistChat(next, conversationHistoryRef.current);
        return next;
      });

      setIsWaiting(true);

      try {
        const response = await fetch(getChatUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: conversationHistoryRef.current }),
        });
        const data = await response.json();

        if (data.reply) {
          conversationHistoryRef.current = [
            ...conversationHistoryRef.current,
            { role: 'assistant', content: data.reply },
          ].slice(-HISTORY_CAP);
          const botTime = getTime();
          setEntries((prev) => {
            const next = [...prev, { role: 'bot', text: data.reply, time: botTime }];
            persistChat(next, conversationHistoryRef.current);
            return next;
          });
        } else {
          setEntries((prev) => {
            const next = [
              ...prev,
              {
                role: 'bot',
                text: 'Entschuldigung, es ist ein Fehler aufgetreten. Bitte versuche es gleich noch einmal.',
                time: getTime(),
              },
            ];
            persistChat(next, conversationHistoryRef.current);
            return next;
          });
        }
      } catch {
        setEntries((prev) => {
          const next = [
            ...prev,
            {
              role: 'bot',
              text: 'Verbindungsfehler. Bitte prüfe deine Internetverbindung und versuche es erneut.',
              time: getTime(),
            },
          ];
          persistChat(next, conversationHistoryRef.current);
          return next;
        });
      } finally {
        setIsWaiting(false);
      }
    },
    [input, isWaiting]
  );

  const sendQuick = (text) => {
    setShowQuickReplies(false);
    sendMessage(text);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleVoiceInput = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor || isWaiting) return;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }

    const rec = new Ctor();
    rec.lang = 'de-DE';
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let text = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) text += event.results[i][0].transcript;
      }
      const t = text.trim();
      if (t) {
        setInput((prev) => {
          const p = (prev || '').trim();
          return p ? `${p} ${t}` : t;
        });
      }
    };

    rec.onerror = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };

    rec.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };

    try {
      recognitionRef.current = rec;
      rec.start();
      setIsListening(true);
      textareaRef.current?.focus();
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
    }
  }, [isWaiting]);

  return (
    <div className="app-root">
      <div className="chat-widget">

        <div className="chat-header">
          <div className="header-logo">⌚</div>
          <div className="header-info">
            <div className="header-name">MisterWatch Berater</div>
            <div className="header-status">
              <div className="status-dot" />
              <span className="status-text">Verbunden – Wie kann ich helfen?</span>
            </div>
          </div>
        </div>

        <div className="messages-area" ref={messagesAreaRef}>
          <div className="date-label">Heute</div>

          <div className="msg-row bot">
            <div className="bot-avatar">⌚</div>
            <div>
              <div className="msg-bubble msg-bubble--md">
                <MarkdownBubble>{WELCOME_MARKDOWN}</MarkdownBubble>
              </div>
              <div className="msg-time">{welcomeTime}</div>
            </div>
          </div>

          {showQuickReplies && (
            <div className="quick-replies">
              {QUICK_ACTIONS.map((q) => (
                <button
                  key={q.text}
                  type="button"
                  className="quick-btn"
                  onClick={() => sendQuick(q.text)}
                >
                  {q.label}
                </button>
              ))}
            </div>
          )}

          {entries.map((m, i) => (
            <div key={`msg-${i}`} className={`msg-row ${m.role}`}>
              {m.role === 'bot' && <div className="bot-avatar">⌚</div>}
              <div>
                <div className={`msg-bubble ${m.role === 'bot' ? 'msg-bubble--md' : ''}`}>
                  {m.role === 'bot' ? (
                    <MarkdownBubble>{m.text}</MarkdownBubble>
                  ) : (
                    m.text
                  )}
                </div>
                <div className="msg-time">{m.time}</div>
              </div>
            </div>
          ))}

          {isWaiting && (
            <div className="msg-row bot typing-indicator">
              <div className="bot-avatar">⌚</div>
              <div className="typing-dots">
                <span /><span /><span />
              </div>
            </div>
          )}
        </div>

        <div className="chat-composer">
          <div className="input-area">
            <div className="input-wrap">
              <textarea
                ref={textareaRef}
                className="user-input"
                rows={1}
                enterKeyHint="send"
                autoComplete="off"
                autoCorrect="on"
                placeholder="Nachricht eingeben …"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={isWaiting}
              />
            </div>
            <div className="composer-actions">
              <button
                type="button"
                className={`mic-btn${isListening ? ' mic-btn--active' : ''}`}
                disabled={isWaiting || !speechSupported}
                onClick={toggleVoiceInput}
                aria-label={isListening ? 'Spracheingabe beenden' : 'Spracheingabe'}
                aria-pressed={isListening}
                title={
                  !speechSupported
                    ? 'Spracheingabe in diesem Browser nicht verfügbar'
                    : isListening
                      ? 'Tippen zum Beenden'
                      : 'Tippen und sprechen (Deutsch)'
                }
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                  <line x1="12" y1="18" x2="12" y2="22" />
                  <line x1="8" y1="22" x2="16" y2="22" />
                </svg>
              </button>
              <button
                type="button"
                className="send-btn"
                disabled={isWaiting}
                onClick={() => sendMessage()}
                aria-label="Senden"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>

          <div className="chat-footer">
            Unterstützt durch <span>künstliche Intelligenz von MisterWatch</span> · misterwatches.store
          </div>
        </div>

      </div>
    </div>
  );
}
