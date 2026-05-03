/**
 * GPT-4o mit Werkzeugen: Buchungen, Anfragen, Kundendienst und Bewertungen.
 */
const {
  insertBooking,
  insertInquiry,
  insertFeedback,
  getPool,
} = require('../db');
const { MINIMAL_CRM_TOOLS_FALLBACK } = require('./chatbotPrompt');

const CHAT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'submit_booking_request',
      description:
        'Reservierung oder Online-Buchung. Aufrufen, sobald Uhr bzw. Modell klar ist sowie Name und mindestens E-Mail oder Telefon aus dem Gespräch vorliegen. Adresse optional (null wenn unbekannt).',
      parameters: {
        type: 'object',
        properties: {
          watch_model: { type: 'string', description: 'Modell / Produktnamen möglichst konkret' },
          quality_tier: {
            type: 'string',
            description: 'AAA+, Highend oder Superclone / unbekannt leerlassen',
          },
          quantity: { type: 'integer', description: 'Stückzahl, Standard 1' },
          customer_name: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          shipping_address: { type: 'string', description: 'Straße, Hausnr., ggf. Zusatz' },
          postal_code: { type: 'string' },
          city: { type: 'string' },
          country: { type: 'string' },
          notes: { type: 'string', description: 'Liefer-/Zahlungswunsch oder Zubehör' },
        },
        required: ['watch_model'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_support_ticket',
      description:
        'Kundendienst-Ticket, sobald die Problembeschreibung (Feld message) klar ist und E-Mail oder Telefon aus dem Gespräch vorliegt oder nachgefragt wurde.',
      parameters: {
        type: 'object',
        properties: {
          subject: { type: 'string' },
          message: { type: 'string' },
          customer_name: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          address_line: { type: 'string' },
          postal_code: { type: 'string' },
          city: { type: 'string' },
          country: { type: 'string' },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_inquiry_lead',
      description:
        'Geschäfts- oder Informationsanfragen und Interessentenanfragen ohne Eilkundendienst. Nachricht als Klartext; möglichst Kontakt (E-Mail, Telefon oder WhatsApp-Hinweis der Person).',
      parameters: {
        type: 'object',
        properties: {
          subject: { type: 'string' },
          message: { type: 'string' },
          customer_name: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          address_line: { type: 'string' },
          postal_code: { type: 'string' },
          city: { type: 'string' },
          country: { type: 'string' },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_feedback_entry',
      description:
        'Bewertung: Skala 1–5 Pflicht, sobald genannt oder erfragt; optional Kurzkommentar, Verbesserungsvorschlag und E-Mail.',
      parameters: {
        type: 'object',
        properties: {
          rating: { type: 'integer', description: 'Pflicht zwischen 1 und 5', minimum: 1, maximum: 5 },
          comment: { type: 'string' },
          suggestion: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['rating'],
      },
    },
  },
];

async function execTool(name, rawArgs) {
  let args = {};
  try {
    args = typeof rawArgs === 'string' ? JSON.parse(rawArgs || '{}') : rawArgs || {};
  } catch {
    return JSON.stringify({ ok: false, error: 'invalid_json' });
  }

  if (!getPool()) {
    return JSON.stringify({
      ok: false,
      error: 'database_unavailable',
      hint: 'Nutzer zur WhatsApp-Weiterleitung informieren (+49 157 55483605).',
    });
  }

  try {
    if (name === 'submit_booking_request') {
      if (!args.watch_model) return JSON.stringify({ ok: false, error: 'watch_model_missing' });
      const id = await insertBooking(args);
      return JSON.stringify({ ok: true, id, saved: 'booking' });
    }
    if (name === 'submit_support_ticket') {
      if (!args.message) return JSON.stringify({ ok: false, error: 'message_missing' });
      const id = await insertInquiry({
        ...args,
        inquiry_type: 'support',
        subject: args.subject || 'Kundendienst',
      });
      return JSON.stringify({ ok: true, id, saved: 'support' });
    }
    if (name === 'submit_inquiry_lead') {
      if (!args.message) return JSON.stringify({ ok: false, error: 'message_missing' });
      const id = await insertInquiry({
        ...args,
        inquiry_type: 'lead',
      });
      return JSON.stringify({ ok: true, id, saved: 'lead' });
    }
    if (name === 'submit_feedback_entry') {
      if (!Number.isFinite(Number(args.rating))) return JSON.stringify({ ok: false, error: 'rating_missing' });
      const id = await insertFeedback(args);
      return JSON.stringify({ ok: true, id, saved: 'feedback' });
    }
    return JSON.stringify({ ok: false, error: `unknown_tool_${name}` });
  } catch (e) {
    console.warn('[tools]', name, e.message);
    return JSON.stringify({ ok: false, error: 'persist_failed', detail: e.message });
  }
}

/**
 * Führt den Chat mit optionaler Werkzeug-Schleife aus.
 * Liefert den Assistententext (Markdown).
 */
async function runAssistantChat(openai, { baseSystemPrompt, crmToolsInstructions = '', recentMessages }) {
  const poolActive = !!getPool();
  const toolsBlock = poolActive
    ? String(crmToolsInstructions || '').trim() || MINIMAL_CRM_TOOLS_FALLBACK
    : '';
  const sys = toolsBlock ? `${baseSystemPrompt}\n${toolsBlock}` : baseSystemPrompt;
  let messagesPayload = [...recentMessages];

  const maxRounds = 5;
  for (let r = 0; r < maxRounds; r += 1) {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: sys }, ...messagesPayload],
      ...(poolActive
        ? {
            tools: CHAT_TOOLS,
            tool_choice: 'auto',
          }
        : {}),
      max_tokens: 640,
      temperature: 0.55,
      presence_penalty: 0.1,
      frequency_penalty: 0.25,
    });

    const msg = completion.choices[0].message;

    if (!poolActive || !msg.tool_calls?.length) {
      return msg.content?.trim() || 'Kurzfassung konnte nicht gebaut werden — bitte noch einmal versuchen.';
    }

    messagesPayload.push({
      role: 'assistant',
      content: msg.content || null,
      tool_calls: msg.tool_calls,
    });

    for (const tc of msg.tool_calls) {
      const fn = tc.function;
      const out = await execTool(fn.name, fn.arguments || '{}');
      messagesPayload.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: out,
      });
    }
  }

  return 'Bitte noch einmal kurz schreiben oder direkt **WhatsApp +49 157 55483605** — danke für deine Geduld.';
}

module.exports = { CHAT_TOOLS, runAssistantChat };
