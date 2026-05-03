# MisterWatch chatbot + voice on WordPress

Your **backend is fine** if `POST /api/voice/session` returns **200**. Failures on WordPress are almost always **browser + page policy**: wrong API host, **CSP**, **iframe mic**, or **WebSocket** to OpenAI.

Replace `https://master-watch-yv9c.vercel.app` with your real API origin if it changes.

---

## 1. Force API root (before the widget script)

In **Appearance → Theme File Editor** (child theme) or a **“Insert Headers”** plugin, **before** the script that loads your Vite bundle:

```html
<script>
  window.__MW_CHAT_API_ROOT__ = "https://master-watch-yv9c.vercel.app";
</script>
```

This makes `frontend/src/apiRoot.js` resolve chat, theme, and **`/api/voice/session`** to your Vercel API even on `misterwatches.store`.

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

Without **`allow="microphone"`**, voice will not work inside the iframe.

**Sandbox:** If you add `sandbox="..."`, you must include everything the app needs (scripts, same-origin if applicable). A too-strict sandbox can break **WebSocket** or **fetch**. Prefer **no sandbox** unless you know each flag.

---

## 3. Content-Security-Policy (critical for voice)

WordPress, **Wordfence**, **Really Simple SSL**, **Cloudflare**, or the theme may send **CSP** that blocks:

- `https://master-watch-yv9c.vercel.app` (your API)
- `https://api.openai.com` and **`wss://api.openai.com`** (Realtime)

**`connect-src`** must include at least:

```text
'self' https://master-watch-yv9c.vercel.app https://api.openai.com wss://api.openai.com
```

How you set this depends on the plugin (HTTP headers, Cloudflare Transform Rules, etc.). Until **`wss://api.openai.com`** is allowed, voice will fail **after** session 200.

---

## 4. Session config on the server (already in this repo)

`POST /api/voice/session` sends a **compact** Realtime session to OpenAI when minting the ephemeral key, so the browser does **not** send a huge `session.update`. The widget still opens **`wss://api.openai.com/v1/realtime`** directly from the visitor’s browser — CSP must allow it (step 3).

---

## 5. Prefer script embed over iframe for voice

Same-origin script on the shop page avoids iframe mic quirks:

```html
<script type="module" src="https://YOUR-WIDGET.vercel.app/assets/index-XXXXX.js"></script>
```

(Use the real `index-*.js` URL from your Vercel build output.)

Alternatively open the widget in a **popup** (`window.open(...)`) so permissions are a normal top-level tab.

---

## 6. HTTPS

Voice and mic require **HTTPS** on the shop (and on the widget origin).

---

## Quick check in DevTools (on misterwatches.store)

1. **Network** → `voice/session` → must hit **`https://master-watch-yv9c.vercel.app`**, not `misterwatches.store`.
2. **Console** → filter “CSP”, “blocked”, “WebSocket”, “getUserMedia”.
3. After session 200, look for **WebSocket** to `api.openai.com` — failed handshake = CSP or network.
