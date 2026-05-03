/**
 * OpenAI Realtime (speech-to-speech) for MisterWatch.
 *
 * Minting: OpenAI recommends a small POST body for `/v1/realtime/sessions` (ephemeral key).
 * Full instructions + tools are sent from the browser via `session.update` after the
 * WebSocket connects (same pattern as voiceagent_backend).
 *
 * Wire audio: pcm16 @ 24 kHz (no Opus flag on Realtime WebSocket).
 */

const { getPool } = require('../db');
const { buildFullSystemPrompt, fetchCrmToolsInstructions } = require('./chatbotPrompt');
const { CHAT_TOOLS } = require('./chatAssistant');

const MAX_INSTRUCTION_CHARS = 14_000;

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

/**
 * Turn detection — default server VAD tuned for laptop / room noise.
 * Optional: OPENAI_REALTIME_VAD_MODE=semantic + OPENAI_REALTIME_VAD_EAGERNESS=low|medium|high|auto
 * Overrides: OPENAI_REALTIME_VAD_THRESHOLD, OPENAI_REALTIME_VAD_SILENCE_MS, OPENAI_REALTIME_VAD_PREFIX_MS
 */
function realtimeTurnDetection() {
  const mode = String(process.env.OPENAI_REALTIME_VAD_MODE || 'server').trim().toLowerCase();
  if (mode === 'semantic' || mode === 'semantic_vad') {
    const e = String(process.env.OPENAI_REALTIME_VAD_EAGERNESS || 'low').trim().toLowerCase();
    const ok = ['low', 'medium', 'high', 'auto'];
    return {
      type: 'semantic_vad',
      eagerness: ok.includes(e) ? e : 'low',
    };
  }

  const threshold = Number.parseFloat(process.env.OPENAI_REALTIME_VAD_THRESHOLD || '');
  const silenceMs = Number.parseInt(process.env.OPENAI_REALTIME_VAD_SILENCE_MS || '', 10);
  const prefixMs = Number.parseInt(process.env.OPENAI_REALTIME_VAD_PREFIX_MS || '', 10);
  return {
    type: 'server_vad',
    threshold: Number.isFinite(threshold) ? Math.min(0.95, Math.max(0.35, threshold)) : 0.73,
    prefix_padding_ms: Number.isFinite(prefixMs) ? Math.min(600, Math.max(120, prefixMs)) : 380,
    silence_duration_ms: Number.isFinite(silenceMs) ? Math.min(2000, Math.max(400, silenceMs)) : 1300,
  };
}

/** Optional: `far_field` | `near_field` — set OPENAI_REALTIME_INPUT_NR=off to disable. */
function optionalInputNoiseReduction() {
  const raw = String(process.env.OPENAI_REALTIME_INPUT_NR || 'far_field').trim().toLowerCase();
  if (!raw || raw === 'off' || raw === '0' || raw === 'false') return null;
  if (raw === 'far_field' || raw === 'near_field') return { type: raw };
  return null;
}

/** Minimal body for POST /v1/realtime/sessions (matches voiceagent_backend style). */
function buildMinimalMintPayload() {
  return {
    model: realtimeModel(),
    voice: realtimeVoice(),
  };
}

/**
 * Full `session` object for the client's `session.update` WebSocket event.
 * Include `type: "realtime"` for GA-compatible clients.
 */
async function buildClientWebsocketSession() {
  const base = await buildFullSystemPrompt();
  const crm = (await fetchCrmToolsInstructions()).trim();
  let instructions = [base, crm, VOICE_DE_SUFFIX].filter(Boolean).join('\n\n').trim();
  if (instructions.length > MAX_INSTRUCTION_CHARS) {
    instructions = `${instructions.slice(0, MAX_INSTRUCTION_CHARS)}\n\n[…gekürzt…]`;
  }

  const poolActive = Boolean(getPool());
  const tools = poolActive ? chatToolsToRealtime(CHAT_TOOLS) : [];
  const tool_choice = tools.length ? 'auto' : 'none';

  const session = {
    modalities: ['text', 'audio'],
    instructions,
    voice: realtimeVoice(),
    input_audio_format: 'pcm16',
    output_audio_format: 'pcm16',
    input_audio_transcription: {
      model: 'whisper-1',
      language: 'de',
    },
    turn_detection: realtimeTurnDetection(),
    tools,
    tool_choice,
    temperature: 0.8,
    max_response_output_tokens: 400,
  };

  const nr = optionalInputNoiseReduction();
  if (nr) {
    session.input_audio_noise_reduction = nr;
  }
  return session;
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
  buildClientWebsocketSession,
  realtimeWireFormatMeta,
  realtimeModel,
};
