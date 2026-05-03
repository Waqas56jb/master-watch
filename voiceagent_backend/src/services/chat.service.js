require("dotenv").config();
const OpenAI   = require("openai");
const fs       = require("fs");
const path     = require("path");
const functions        = require("./openai.functions");
const { executeFunction } = require("./function.executor");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Load system prompt once at startup
const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, "../config/system-prompt.md"),
  "utf8"
);

const chat = async (messages, token = null) => {
  // Build message history for OpenAI (last 20 messages)
  const history = messages.slice(-20);

  const openaiMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
  ];

  let sessionToken = token;
  let sessionUser  = null;

  // ── Agentic loop — AI calls functions until it has a final answer ──
  for (let round = 0; round < 10; round++) {
    const response = await openai.chat.completions.create({
      model:       "gpt-4o",
      messages:    openaiMessages,
      tools:       functions.map(fn => ({ type: "function", function: fn })),
      tool_choice: "auto",
    });

    const choice = response.choices[0];

    // ── AI wants to call one or more functions ──────────────────
    if (choice.finish_reason === "tool_calls") {
      const assistantMsg = choice.message;
      openaiMessages.push(assistantMsg);

      for (const toolCall of assistantMsg.tool_calls) {
        const fnName = toolCall.function.name;
        const fnArgs = JSON.parse(toolCall.function.arguments || "{}");

        console.log(`[Hop] Calling: ${fnName}`, fnArgs);

        const result = await executeFunction(fnName, fnArgs, sessionToken);

        // Extract token from login/register/otp-verify responses
        if (result?.data?.token) {
          sessionToken = result.data.token;
        }
        if (result?.data?.user) {
          sessionUser = result.data.user;
        }

        openaiMessages.push({
          role:         "tool",
          tool_call_id: toolCall.id,
          content:      JSON.stringify(result),
        });
      }

      // Continue loop — AI will process function results
      continue;
    }

    // ── AI has a final text response ────────────────────────────
    if (choice.finish_reason === "stop") {
      return {
        reply: choice.message.content,
        token: sessionToken !== token ? sessionToken : undefined,
        user:  sessionUser || undefined,
      };
    }

    // Unexpected finish
    break;
  }

  return {
    reply: "Something went sideways on my end — sorry about that. Try again in a moment. 🙏",
  };
};

module.exports = { chat };
