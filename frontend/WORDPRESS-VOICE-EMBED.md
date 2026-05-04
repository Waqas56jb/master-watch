# MisterWatch chatbot + voice on WordPress

If the UI shows **“SYSTEM FAULT / ERROR”** *after* the mic UI appears and **`POST /api/voice/session` is 200**, the flow is:

1. Widget loads  
2. User starts voice  
3. Mic UI / permission path runs  
4. **`/api/voice/session` → 200** (your Vercel backend is OK)  
5. Browser opens **`wss://api.openai.com/v1/realtime`** → **fails** (policy / network)  
6. UI shows error  

So this is **not** “guesswork”: it is almost always **WebSocket + browser environment** on the shop page (CSP, iframe, or wrong API host for earlier steps).

The app already uses **`wss://`** (not `ws://`) and does **not** proxy the Realtime socket through WordPress — see `frontend/src/hooks/useMisterWatchVoiceAgent.js`. Session mint uses a **compact** payload on the server (`backend/lib/voiceRealtimeSession.js`).

Replace `https://master-watch-yv9c.vercel.app` below if your API URL changes.

---

## Prove it in 10 seconds (WordPress → DevTools → Console)

Filter or search for:

- `WebSocket connection failed`
- `Refused to connect` / `wss://api.openai.com`
- `Content Security Policy` / `connect-src` / `blocked`

If you see CSP / blocked → fix **connect-src** (next section).

---

## 1. Force API root (before the widget script)

**Before** the script that loads your Vite bundle:

```html
<script>
  window.__MW_CHAT_API_ROOT__ = "https://master-watch-yv9c.vercel.app";
</script>
```

This makes `frontend/src/apiRoot.js` resolve chat, theme, and **`/api/voice/session`** to your API even when the page is `misterwatches.store`.

---

## 2. Iframe embed (if you use one)

```html
<iframe
  src="https://YOUR-WIDGET.vercel.app"
  title="MisterWatch Chat"
  allow="microphone; autoplay"
  style="width:380px;height:560px;border:0;border-radius:12px"
></iframe>
```

Without **`allow="microphone"`**, voice will not work reliably inside the iframe.

**Sandbox:** A too-strict `sandbox="..."` can break **WebSocket** or **fetch**. Prefer **no sandbox** unless you know each flag.

---

## 3. Content-Security-Policy (most common voice killer)

Themes/plugins (**Wordfence**, **Really Simple SSL**, **Security Headers**, **Cloudflare**) often send CSP with a tight **`connect-src`**, e.g. only `'self'`. That **blocks**:

- `https://master-watch-yv9c.vercel.app` (your API)
- `https://api.openai.com` and **`wss://api.openai.com`** (OpenAI Realtime)

**`connect-src`** must allow at least:

```text
'self' https://master-watch-yv9c.vercel.app https://api.openai.com wss://api.openai.com
```

### Apache / Nginx (example header)

Merge with your existing CSP; do not duplicate conflicting headers.

```http
Content-Security-Policy: connect-src 'self' https://master-watch-yv9c.vercel.app https://api.openai.com wss://api.openai.com;
```

(You may also need `script-src` / `frame-src` for your widget origin — adjust to your full policy.)

### Cloudflare

Use **Transform Rules** or **HTTP Response Headers** to widen **`connect-src`** as above.

### WordPress security plugins

Look for **CSP**, **HTTP headers**, or **Hardening** → add **`connect-src`** entries for the two OpenAI URLs and your API origin.

Until **`wss://api.openai.com`** is allowed, voice will fail **after** session 200.

---

## 4. Prefer script embed or popup (fewer restrictions)

**Script embed** (widget runs in the shop page’s browsing context, no iframe mic sandbox):

```html
<script type="module" src="https://YOUR-WIDGET.vercel.app/assets/index-XXXXX.js"></script>
```

Use the real `index-*.js` URL from your Vercel build.

**Popup:** `window.open('https://YOUR-WIDGET.vercel.app', ...)` — top-level tab, simpler permissions.

---

## 5. HTTPS

Voice + mic need **HTTPS** on the shop and on the widget origin.

---

## Quick checks (Network tab)

1. **`voice/session`** request URL must be **`https://master-watch-yv9c.vercel.app/...`**, not `https://misterwatches.store/...`.
2. After 200, find the **WebSocket** to **`api.openai.com`** — if it never connects or closes immediately, treat as CSP / network.

When the socket fails, the widget also logs a **console warning** pointing back to this file.
