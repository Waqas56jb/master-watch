const express = require('express');
const { buildOpenAIRealtimeSessionBody, realtimeWireFormatMeta } = require('../lib/voiceRealtimeSession');
const { executeVoiceCrmTool } = require('../lib/chatAssistant');

const router = express.Router();

const OPENAI_SESSION_URL =
  String(process.env.OPENAI_REALTIME_SESSION_URL || '').trim() ||
  'https://api.openai.com/v1/realtime/sessions';

/**
 * POST /api/voice/session
 * Mints an ephemeral client secret; session (German, PCM16, tools) is attached to the token.
 */
router.post('/session', async (req, res) => {
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key || !String(key).trim()) {
      return res.status(503).json({ error: 'OPENAI_API_KEY fehlt auf dem Server.' });
    }

    const sessionBody = await buildOpenAIRealtimeSessionBody();

    const response = await fetch(OPENAI_SESSION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${String(key).trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sessionBody),
    });

    const data = await response.json().catch(() => ({}));

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

    return res.json({
      ephemeralKey,
      model: data.model || sessionBody.model,
      sessionConfiguredAtMint: true,
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
