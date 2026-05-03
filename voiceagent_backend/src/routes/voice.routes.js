const express  = require("express");
const { executeFunction } = require("../services/function.executor");

const router = express.Router();

// ── POST /api/voice/session ─────────────────────────────────────────────────
router.post("/session", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not set on the server" });
    }

    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "echo",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI voice session error:", JSON.stringify(data));
      return res.status(response.status).json({ error: data });
    }

    res.json({ ephemeralKey: data.client_secret.value });
  } catch (err) {
    console.error("Voice session error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/voice/execute-tool ────────────────────────────────────────────
// Called by the frontend when OpenAI Realtime asks for a tool/function result.
// We execute the function against the Hop'n Portal API and return the result.
router.post("/execute-tool", async (req, res) => {
  const { name, arguments: argsRaw, token } = req.body;
  try {
    const args   = typeof argsRaw === "string" ? JSON.parse(argsRaw) : argsRaw;
    const result = await executeFunction(name, args, token || null);
    res.json({ result });
  } catch (err) {
    console.error("Tool execution error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
