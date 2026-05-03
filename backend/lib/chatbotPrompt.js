const { query, getPool, fetchActiveKnowledgeForPrompt } = require('../db');

/** When DB is missing, empty, or unreadable — short safe default (no shop-specific claims). */
const FALLBACK_SYSTEM_PROMPT =
  'Du bist ein Kundenservice-Chatbot. Antworte knapp und höflich auf Deutsch. ' +
  'Leite bei konkreten Bestellungen oder Beschwerden auf den vom Betreiber genannten Support-Kanal. ' +
  'Erfinde keine Preise oder Richtlinien — bitte im Admin-Bereich unter „Chatbot – System“ und „Seiten-Wissen“ Inhalte pflegen.';

const MINIMAL_CRM_TOOLS_FALLBACK =
  'CRM: Nutze bei passender Absicht die Funktionen submit_booking_request, submit_support_ticket, submit_inquiry_lead, submit_feedback_entry. ' +
  'Vor Aufruf fehlende Pflichtangaben gezielt erfragen; nach Speicherung kurz bestätigen.';

async function getPromptConfigRow() {
  const r = await query(
    `SELECT global_instructions, crm_tools_instructions FROM chatbot_prompt_config WHERE id = 1`
  );
  return r.rows[0] || null;
}

async function fetchActivePromptPagesBlock() {
  const r = await query(
    `
    SELECT page_key, display_title, content
    FROM chatbot_prompt_pages
    WHERE is_active = TRUE AND length(trim(content)) > 0
    ORDER BY sort_order ASC NULLS LAST, display_title ASC
    `
  );
  if (!r.rows.length) return '';
  return r.rows
    .map((row) => {
      const body = String(row.content || '').trim();
      const title = String(row.display_title || row.page_key || 'Abschnitt').trim();
      return `== ${title} (Seite: ${row.page_key}) ==\n\n${body}`;
    })
    .join('\n\n');
}

/**
 * Full system prompt: global (DB) + active per-page blocks + knowledge_entries appendix.
 */
async function buildFullSystemPrompt() {
  if (!getPool()) return FALLBACK_SYSTEM_PROMPT;
  try {
    const row = await getPromptConfigRow();
    const global = (row?.global_instructions || '').trim();
    let pages = '';
    try {
      pages = (await fetchActivePromptPagesBlock()).trim();
    } catch (e2) {
      if (e2 && e2.code !== '42P01') console.warn('[prompt] pages block:', e2.message);
    }
    let core = [global, pages].filter(Boolean).join('\n\n').trim();
    if (!core) core = FALLBACK_SYSTEM_PROMPT;
    try {
      const extra = await fetchActiveKnowledgeForPrompt();
      if (extra) return `${core}${extra}`;
    } catch (e) {
      console.warn('[KB] Could not load DB knowledge:', e.message);
    }
    return core;
  } catch (e) {
    if (e && (e.code === '42P01' || /does not exist/i.test(String(e.message)))) {
      console.warn('[prompt] Tables missing — run npm run db:apply');
    } else {
      console.warn('[prompt] buildFullSystemPrompt:', e.message);
    }
    return FALLBACK_SYSTEM_PROMPT;
  }
}

/** CRM / tool behavior block appended to system message when DB pool is active. */
async function fetchCrmToolsInstructions() {
  if (!getPool()) return '';
  try {
    const row = await getPromptConfigRow();
    const t = (row?.crm_tools_instructions || '').trim();
    return t || MINIMAL_CRM_TOOLS_FALLBACK;
  } catch (e) {
    console.warn('[prompt] fetchCrmToolsInstructions:', e.message);
    return MINIMAL_CRM_TOOLS_FALLBACK;
  }
}

module.exports = {
  buildFullSystemPrompt,
  fetchCrmToolsInstructions,
  FALLBACK_SYSTEM_PROMPT,
  MINIMAL_CRM_TOOLS_FALLBACK,
};
