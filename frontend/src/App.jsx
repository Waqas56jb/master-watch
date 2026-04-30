import { useCallback, useEffect, useRef, useState } from 'react';
import MarkdownBubble from './MarkdownBubble.jsx';

// Dev: Vite proxy → `/chat`. Production: deployed API (override with VITE_API_URL if needed).
const PRODUCTION_API_BASE = 'https://master-watch-fwr2.vercel.app';
const envBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const API_BASE = envBase || (import.meta.env.PROD ? PRODUCTION_API_BASE : '');
const API_URL = API_BASE ? `${API_BASE}/chat` : '/chat';

const WELCOME_MARKDOWN = `Willkommen bei **MisterWatch**! 👋

Ich helfe dir bei Fragen zu Uhren, Lieferung und Zahlung.

**Wie kann ich dir heute helfen?**`;

const QUICK_ACTIONS = [
  { label: '🏅 Qualitäten', text: 'Welche Qualitätsstufen gibt es?' },
  { label: '💰 Preise', text: 'Was kosten eure Uhren?' },
  { label: '📦 Lieferzeit', text: 'Wie lange dauert die Lieferung?' },
  { label: '💳 Zahlung', text: 'Welche Zahlungsmethoden bietet ihr an?' },
  { label: '↩️ Rückgabe', text: 'Kann ich die Uhr zurückgeben?' },
];

function getTime() {
  return new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export default function App() {
  const [welcomeTime] = useState(() => getTime());
  const [showQuickReplies, setShowQuickReplies] = useState(true);
  const [entries, setEntries] = useState([]);
  const [input, setInput] = useState('');
  const [isWaiting, setIsWaiting] = useState(false);
  const conversationHistoryRef = useRef([]);
  const messagesAreaRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    const el = messagesAreaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [entries, isWaiting, showQuickReplies, scrollToBottom]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 100)}px`;
  }, [input]);

  const sendMessage = useCallback(
    async (forcedText) => {
      const raw = forcedText !== undefined ? forcedText : input;
      const text = (typeof raw === 'string' ? raw : input).trim();
      if (!text || isWaiting) return;

      setInput('');
      setShowQuickReplies(false);

      const userTime = getTime();
      setEntries((prev) => [...prev, { role: 'user', text, time: userTime }]);
      conversationHistoryRef.current = [...conversationHistoryRef.current, { role: 'user', content: text }];

      setIsWaiting(true);

      try {
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: conversationHistoryRef.current }),
        });
        const data = await response.json();

        if (data.reply) {
          const botTime = getTime();
          setEntries((prev) => [...prev, { role: 'bot', text: data.reply, time: botTime }]);
          conversationHistoryRef.current = [
            ...conversationHistoryRef.current,
            { role: 'assistant', content: data.reply },
          ];
        } else {
          setEntries((prev) => [
            ...prev,
            {
              role: 'bot',
              text: 'Entschuldigung, es gab einen Fehler. Bitte versuche es erneut.',
              time: getTime(),
            },
          ]);
        }
      } catch {
        setEntries((prev) => [
          ...prev,
          {
            role: 'bot',
            text: 'Verbindungsfehler. Bitte überprüfe deine Internetverbindung und versuche es erneut.',
            time: getTime(),
          },
        ]);
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

  return (
    <div className="app-root">
      <div className="chat-widget">
        <div className="chat-header">
          <div className="header-logo">⌚</div>
          <div className="header-info">
            <div className="header-name">MisterWatch Assistent</div>
            <div className="header-status">
              <div className="status-dot" />
              <span className="status-text">Online – Bereit zu helfen</span>
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
                <button key={q.text} type="button" className="quick-btn" onClick={() => sendQuick(q.text)}>
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
                  {m.role === 'bot' ? <MarkdownBubble>{m.text}</MarkdownBubble> : m.text}
                </div>
                <div className="msg-time">{m.time}</div>
              </div>
            </div>
          ))}

          {isWaiting && (
            <div className="msg-row bot typing-indicator">
              <div className="bot-avatar">⌚</div>
              <div className="typing-dots">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
        </div>

        <div className="input-area">
          <div className="input-wrap">
            <textarea
              ref={textareaRef}
              className="user-input"
              rows={1}
              placeholder="Schreib deine Frage…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={isWaiting}
            />
          </div>
          <button
            type="button"
            className="send-btn"
            disabled={isWaiting}
            onClick={() => sendMessage()}
            aria-label="Senden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>

        <div className="chat-footer">
          Unterstützt von <span>MisterWatch KI</span> · misterwatches.store
        </div>
      </div>
    </div>
  );
}
