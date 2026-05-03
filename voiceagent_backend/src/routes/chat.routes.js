const express = require("express");
const router  = express.Router();
const { chat } = require("../services/chat.service");

router.post("/", async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array is required" });
    }

    // Extract Bearer token from request headers if user is logged in
    const authHeader = req.headers["authorization"];
    const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

    const result = await chat(messages, token);
    res.json(result);
  } catch (err) {
    console.error("[Chat Error]", err.message);
    res.status(500).json({
      reply: "Something went sideways on my end — sorry about that. Try again in a moment. 🙏",
    });
  }
});

module.exports = router;
