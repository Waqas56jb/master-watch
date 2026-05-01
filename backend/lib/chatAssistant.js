/**
 * GPT-4o tool-use loop for leads, bookings, support & feedback.
 */
const {
  insertBooking,
  insertInquiry,
  insertFeedback,
  getPool,
} = require('../db');

const TOOLS_INSTRUCTION_APPEND = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERBINDLICH: CRM / TOOLS (PostgreSQL aktiv)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Gedächtnis:** Bis zu **20 Nachrichten** (User + Assistent) liegen vor. Bekannte Angaben aus dem Verlauf **nicht noch einmal aufdrängen** — nur echte **Lücken** schließen (**eine Hauptfrage** pro Nachricht vor dem ersten Tool).

**Ausgabe (Markdown, professionell, kurz):**
- Vor Tool: höchstens **eine klare Kernfrage** + optional **ein** zusätzlicher Satz Kontext.
- Nach erfolgreicher Tool-Antwort (Speicherungs-Erfolg laut Tool-JSON mit ok true): **Bestätigung in 4–8 Zeilen**, Struktur: **ein Satz Kopf**, dann Markdown-Liste mit **- Punkt**, optional **„Nächster Schritt“** (WhatsApp oder Hinweis auf zeitnahe Rückmeldung).
- Nach **failure** ohne Speicherung: **keinen Erfolg vortäuschen** — höflich entschuldigen, **WhatsApp +49 157 55483605** oder erneuter Versuch.
- Emoji sparsam: ⌚ ✅ 📦 (max. zwei pro Bubble).

**Intents ↔ Tools:**
| Situation | Tool |
|-----------|------|
| Reservierung / Buchung / „Uhr kaufen“ / Bestell-Anfrage | **submit_booking_request** |
| Problem / Reklamation / Support | **submit_support_ticket** |
| geschäftliche Anfrage / Lead ohne Eil-Support | **submit_inquiry_lead** |
| Bewertung 1–5 / Feedback zur Zufriedenheit | **submit_feedback_entry** |

**1. Buchung — submit_booking_request**
Pflichtfelder vor Aufruf: **watch_model** (konkret: Marke/Serie wenn genannt).
Dazu zusammen mit Verlauf abgesichert: **Name** und **mind. eines** aus **Telefon oder E-Mail** (nach Möglichkeit beides nicht zwingend, aber mindestens **ein seriös erreichbarer Kanal**).
Optional und ideal: **Versand-Adresse oder PLZ+Ort+Land**, **quality_tier**, **quantity**, **notes** (Liefer-/Zahlungs-Hinweise).
Liegt Modell + Name + Kontaktkanal klar vor → **Tool sofort**. Fehlt nur Adresse kurz nachfragen **oder** null setzen und im Text angeben, dass sich das Team ggf. meldet.

**2. Support — submit_support_ticket**
Pflicht **message**: verständlicher Problemkern.
Mit **subject** wenn passend („Versand“, „Reklamation“, …).
Dazu nach Möglichkeit **E-Mail oder Telefon** aus Verlauf oder **eine** gezielte Rückfrage.
Adress-/Ortfelder optional.

**3. Lead — submit_inquiry_lead**
Klare geschäftliche **message**. Idealerweise **E-Mail oder Telefon** ergänzend.

**4. Feedback — submit_feedback_entry**
**rating** 1–5 als Ganzzahl: wenn unbekannt genau eine Antwort erwarten mit Skala („1 sehr schlecht … 5 sehr gut“).
Dann Tool; optional comment, suggestion, email.

Zwischen zwei Tool-Runden keine langen Essays — immer **kurz gefasst**.
`;

const CHAT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'submit_booking_request',
      description:
        'Reservierung/Online-Buchung. Nutzen sobald konkretes Uhr-/Modell bekannt IST und Name sowie mindestens E-Mail oder Telefon aus Gespräch klar sind. Adresse optional (null wenn unbekannt).',
      parameters: {
        type: 'object',
        properties: {
          watch_model: { type: 'string', description: 'Modell / Produktnamen möglichst konkret' },
          quality_tier: {
            type: 'string',
            description: 'AAA+, Highend oder Superclone / unbekannt leerlassen',
          },
          quantity: { type: 'integer', description: 'Stückzahl, default 1' },
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
        'Support / Problem-Ticket sobald konkrete Problembeschreibung (message) feststeht plus E-Mail oder Telefon aus Gespräch bzw. nach Rückfrage.',
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
        'Geschäfts-/Informations-Anfragen & Leads (kein Sofort-Eilfall). Nachricht als Klartext; möglichst Kontakt (E-Mail/Telefon/WhatsApp-Verweis vom Nutzer).',
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
        'Nutzerfeedback: Bewertung 1–5 Pflicht sobald angegeben/abgefragt; optional Kurzkommentar, Verbesserungsvorschlag und E-Mail.',
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
        subject: args.subject || 'Support',
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
 * Runs chat completion with optional tool loop.
 * Returns assistant text (markdown).
 */
async function runAssistantChat(openai, { baseSystemPrompt, recentMessages }) {
  const poolActive = !!getPool();
  const sys = poolActive ? `${baseSystemPrompt}\n${TOOLS_INSTRUCTION_APPEND}` : baseSystemPrompt;
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

module.exports = { CHAT_TOOLS, TOOLS_INSTRUCTION_APPEND, runAssistantChat };
