const express = require('express');
const {
  buildMinimalMintPayload,
  buildOpenAiMintBody,
  buildMintToolSourceSession,
  buildLightWebSocketSession,
  realtimeWireFormatMeta,
  realtimeModel,
} = require('../lib/voiceRealtimeSession');
const { executeVoiceCrmTool } = require('../lib/chatAssistant');

const router = express.Router();

/** Bump via env on deploy to prove Vercel runs this file (see Vercel logs for `[voice/session]`). */
const VOICE_ROUTE_REVISION =
  String(process.env.VOICE_ROUTE_REVISION || '').trim() || 'mw-voice-route-v3-2026-02';

const OPENAI_SESSION_URL =
  String(process.env.OPENAI_REALTIME_SESSION_URL || '').trim() ||
  'https://api.openai.com/v1/realtime/sessions';

/**
 * POST /api/voice/session
 * Mints ephemeral key. Prefer configuring the Realtime session on this POST so the browser
 * avoids a large `session.update` over WebSocket (fragile on embeds / strict WS limits).
 */
router.post('/session', async (req, res) => {
  try {
    console.log(`[voice/session] ${VOICE_ROUTE_REVISION} — request received`);

    const key = process.env.OPENAI_API_KEY;
    if (!key || !String(key).trim()) {
      return res.status(503).json({ error: 'OPENAI_API_KEY fehlt auf dem Server.' });
    }

    const clientSession = buildMintToolSourceSession();
    const fullMint = buildOpenAiMintBody(clientSession);
    const minimalMint = buildMinimalMintPayload();

    async function mintOpenAI(body) {
      const headers = {
        Authorization: `Bearer ${String(key).trim()}`,
        'Content-Type': 'application/json',
      };
      const model = body?.model || fullMint.model || realtimeModel();
      if (/preview/i.test(String(model))) {
        headers['OpenAI-Beta'] = 'realtime=v1';
      }
      return fetch(OPENAI_SESSION_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    }

    let response = await mintOpenAI(fullMint);
    let data = await response.json().catch(() => ({}));
    let sessionConfiguredAtMint = response.ok;

    if (!response.ok) {
      const mintNoTools = { ...fullMint };
      delete mintNoTools.tools;
      delete mintNoTools.tool_choice;
      console.warn(
        '[voice/session] Full mint rejected; retrying without tools. Status:',
        response.status,
        JSON.stringify(data).slice(0, 400)
      );
      response = await mintOpenAI(mintNoTools);
      data = await response.json().catch(() => ({}));
      sessionConfiguredAtMint = response.ok;
    }

    if (!response.ok) {
      console.warn(
        '[voice/session] Mint without tools rejected; minimal mint. Status:',
        response.status,
        JSON.stringify(data).slice(0, 400)
      );
      response = await mintOpenAI(minimalMint);
      data = await response.json().catch(() => ({}));
      sessionConfiguredAtMint = false;
    }

    if (!response.ok) {
      console.error('[voice/session] OpenAI error:', response.status, JSON.stringify(data).slice(0, 800));
      return res.status(response.status).json({
        error: data.error || data,
        audio: realtimeWireFormatMeta(),
      });
    }

    const ephemeralKey = data?.client_secret?.value;
    if (!ephemeralKey) {
      console.error('[voice/session] Missing client_secret.value:', Object.keys(data || {}));
      return res.status(502).json({ error: 'Ungültige Antwort von OpenAI (kein client_secret).' });
    }

    const clientSessionOut = sessionConfiguredAtMint ? null : buildLightWebSocketSession(clientSession);

    const clientSessionJsonBytes = clientSessionOut ? Buffer.byteLength(JSON.stringify(clientSessionOut), 'utf8') : 0;
    const instructionsChars =
      clientSessionOut && typeof clientSessionOut.instructions === 'string'
        ? clientSessionOut.instructions.length
        : 0;
    console.log(
      `[voice/session] ${VOICE_ROUTE_REVISION} ok — sessionConfiguredAtMint=${sessionConfiguredAtMint} ` +
        `clientSessionJsonBytes=${clientSessionJsonBytes} instructionsChars=${instructionsChars} ` +
        `(light fallback uses ~1.5–3k chars instructions, not catalog; if instructionsChars > 8000 see deployment)`
    );

    res.setHeader('X-MW-Voice-Route', VOICE_ROUTE_REVISION);
    res.setHeader('X-MW-Voice-Session-Configured', sessionConfiguredAtMint ? '1' : '0');
    res.setHeader('X-MW-Voice-ClientSession-Bytes', String(clientSessionJsonBytes));

    return res.json({
      ephemeralKey,
      model: data.model || fullMint.model || realtimeModel(),
      clientSession: clientSessionOut,
      sessionConfiguredAtMint,
      audio: realtimeWireFormatMeta(),
    });
  } catch (err) {
    console.error('[voice/session]', err?.message || err);
    return res.status(500).json({ error: err?.message || 'Voice-Session fehlgeschlagen.' });
  }
});

/**
 * POST /api/voice/execute-tool
 * CRM tools (same persistence as /chat) for Realtime function calls.
 */
router.post('/execute-tool', async (req, res) => {
  const { name, arguments: argsRaw } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name fehlt oder ungültig.' });
  }
  try {
    const argsStr = typeof argsRaw === 'string' ? argsRaw : JSON.stringify(argsRaw ?? {});
    const result = await executeVoiceCrmTool(name, argsStr);
    return res.json({ result });
  } catch (err) {
    console.error('[voice/execute-tool]', name, err?.message || err);
    return res.status(500).json({ error: err?.message || 'Tool fehlgeschlagen.' });
  }
});

module.exports = router;
