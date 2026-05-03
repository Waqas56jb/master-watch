/**
 * OpenAI Realtime (speech-to-speech) session payload for MisterWatch.
 *
 * Audio codecs (official Realtime WebSocket): `pcm16` (24 kHz mono), `g711_ulaw`, `g711_alaw`.
 * There is no Opus option on the Realtime session — Opus appears in WebRTC elsewhere;
 * the browser hook sends PCM16 frames, which matches the API contract.
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

/**
 * Builds the JSON body for POST https://api.openai.com/v1/realtime/sessions
 */
async function buildOpenAIRealtimeSessionBody() {
  const base = await buildFullSystemPrompt();
  const crm = (await fetchCrmToolsInstructions()).trim();
  let instructions = [base, crm, VOICE_DE_SUFFIX].filter(Boolean).join('\n\n').trim();
  if (instructions.length > MAX_INSTRUCTION_CHARS) {
    instructions = `${instructions.slice(0, MAX_INSTRUCTION_CHARS)}\n\n[…gekürzt…]`;
  }

  const poolActive = Boolean(getPool());
  const tools = poolActive ? chatToolsToRealtime(CHAT_TOOLS) : [];
  const tool_choice = tools.length ? 'auto' : 'none';

  const model =
    String(process.env.OPENAI_REALTIME_MODEL || '').trim() ||
    'gpt-4o-realtime-preview-2024-12-17';
  const voice = String(process.env.OPENAI_REALTIME_VOICE || 'echo').trim() || 'echo';

  return {
    model,
    modalities: ['text', 'audio'],
    instructions,
    voice,
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
  buildOpenAIRealtimeSessionBody,
  realtimeWireFormatMeta,
};
