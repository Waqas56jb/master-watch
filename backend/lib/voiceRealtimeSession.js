/**
 * OpenAI Realtime (speech-to-speech) for MisterWatch.
 *
 * Minting: POST `/v1/realtime/sessions` uses a **compact** instruction block + tools so the
 * browser does not send a huge `session.update` (WordPress / CSP / embed‑sensitive).
 * If full mint fails, the client may still receive a trimmed `clientSession` for WS fallback.
 *
 * Wire audio: pcm16 @ 24 kHz (no Opus flag on Realtime WebSocket).
 */

const { getPool } = require('../db');
const { buildFullSystemPrompt, fetchCrmToolsInstructions } = require('./chatbotPrompt');
const { CHAT_TOOLS } = require('./chatAssistant');

/** Realtime `session.update` over WebSocket can fail if this is too large; mint-on-server carries the same cap. */
const MAX_INSTRUCTION_CHARS = 8_000;

/**
 * Short mint-only instructions (WordPress / embed safe). Full catalog lives in text chat;
 * voice directs users to misterwatches.store and WhatsApp for detail.
 */
const VOICE_MINT_INSTRUCTIONS = `
Du bist der offizielle deutschsprachige Voice-Assistent von MisterWatch (misterwatches.store).
Du hilfst bei Uhren, Qualitätsstufen (AAA+, Highend, Superclone), Preisen grob, Versand (DHL, EU),
Zahlung (PayPal, Klarna, Karte, Bank, Twint) und Bestellablauf. Antworte kurz und natürlich.
Für Modelllisten, exakte Preise und Bestellabschluss: verweise auf den Shop und WhatsApp +49 157 55483605.
Nutze die bereitgestellten Tools für Buchung, Support-Ticket, Lead und Bewertung sobald der Nutzer genug gesagt hat.
`.trim();

/** Strict German + spoken-output rules (same shop context as text chat). */
const VOICE_DE_SUFFIX = `
═══ SPRACHE (VERBINDLICH) ═══
- Du sprichst ausschließlich Deutsch. Keine anderen Sprachen, keine Einzelwörter auf Englisch außer etablierte Markennamen aus dem Kontext.
- Wenn der Nutzer eine andere Sprache spricht, antworte trotzdem auf Deutsch und bitte kurz, auf Deutsch weiterzureden.

═══ STIMME / FORMAT ═══
- Kurze, natürliche gesprochene Sätze (maximal zwei Sätze pro Antwort).
- Kein Markdown, keine nummerierten Listen beim Vorlesen; Uhr- oder Preisangaben klar und langsam genug.
- Nutze nur Informationen aus dem Systemkontext; nichts erfinden. Bei fehlenden Fakten ehrlich nachfragen oder auf den Shop/Support verweisen, wie im Text-Chat vorgegeben.
`.trim();

function chatToolsToRealtime(tools) {
  return tools.map((t) => ({
    type: 'function',
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }));
}

function realtimeModel() {
  return (
    String(process.env.OPENAI_REALTIME_MODEL || '').trim() ||
    'gpt-4o-realtime-preview-2024-12-17'
  );
}

function realtimeVoice() {
  return String(process.env.OPENAI_REALTIME_VOICE || 'echo').trim() || 'echo';
}

/** Minimal body for POST /v1/realtime/sessions (matches voiceagent_backend style). */
function buildMinimalMintPayload() {
  return {
    model: realtimeModel(),
    voice: realtimeVoice(),
  };
}

/**
 * Compact POST body for `/v1/realtime/sessions` — short instructions + same tools as WS fallback.
 * Avoids pasting the full text-chat system prompt into the mint body (embed / OpenAI limits).
 */
function buildOpenAiMintBody(clientSession) {
  const base = buildMinimalMintPayload();
  const instructions = `${VOICE_MINT_INSTRUCTIONS}\n\n${VOICE_DE_SUFFIX}`.trim();
  const body = {
    ...base,
    modalities: ['text', 'audio'],
    instructions,
    input_audio_format: 'pcm16',
    output_audio_format: 'pcm16',
    input_audio_transcription: {
      model: 'whisper-1',
      language: 'de',
    },
    turn_detection: {
      type: 'server_vad',
      threshold: 0.45,
      prefix_padding_ms: 200,
      silence_duration_ms: 600,
    },
    temperature: 0.8,
    max_output_tokens: 400,
  };
  if (clientSession && Array.isArray(clientSession.tools) && clientSession.tools.length > 0) {
    body.tools = clientSession.tools;
    body.tool_choice = clientSession.tool_choice || 'auto';
  }
  return body;
}

/**
 * Full `session` object for the client's `session.update` WebSocket event.
 * Include `type: "realtime"` for GA-compatible clients.
 */
/** @param {{ maxInstructionChars?: number }} [opts] */
async function buildClientWebsocketSession(opts = {}) {
  const cap = Number(opts.maxInstructionChars) > 0 ? Number(opts.maxInstructionChars) : MAX_INSTRUCTION_CHARS;
  const base = await buildFullSystemPrompt();
  const crm = (await fetchCrmToolsInstructions()).trim();
  let instructions = [base, crm, VOICE_DE_SUFFIX].filter(Boolean).join('\n\n').trim();
  if (instructions.length > cap) {
    instructions = `${instructions.slice(0, cap)}\n\n[…gekürzt…]`;
  }

  const poolActive = Boolean(getPool());
  const tools = poolActive ? chatToolsToRealtime(CHAT_TOOLS) : [];
  const tool_choice = tools.length ? 'auto' : 'none';

  return {
    modalities: ['text', 'audio'],
    instructions,
    voice: realtimeVoice(),
    input_audio_format: 'pcm16',
    output_audio_format: 'pcm16',
    input_audio_transcription: {
      model: 'whisper-1',
      language: 'de',
    },
    turn_detection: {
      type: 'server_vad',
      threshold: 0.45,
      prefix_padding_ms: 200,
      silence_duration_ms: 600,
    },
    tools,
    tool_choice,
    temperature: 0.8,
    max_response_output_tokens: 400,
  };
}

function realtimeWireFormatMeta() {
  return {
    inputFormat: 'pcm16',
    outputFormat: 'pcm16',
    sampleRateHz: 24000,
    opusOnRealtimeWebSocket: false,
    note:
      'OpenAI Realtime (WebSocket) akzeptiert pcm16 @24kHz oder G.711 — kein Opus-Codec-Flag. ' +
      'Der MisterWatch-Client streamt PCM16; für reines Opus müsste serverseitig transkodiert werden.',
  };
}

module.exports = {
  buildMinimalMintPayload,
  buildOpenAiMintBody,
  buildClientWebsocketSession,
  realtimeWireFormatMeta,
  realtimeModel,
};
