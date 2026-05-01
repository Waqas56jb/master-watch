const express = require('express');
const { getChatbotTheme, getPool, DEFAULT_CHATBOT_THEME, CHATBOT_THEME_LABELS } = require('../db');

const router = express.Router();

router.get('/chatbot-theme', async (_req, res) => {
  try {
    if (!getPool()) {
      return res.json({ theme: DEFAULT_CHATBOT_THEME, labels: CHATBOT_THEME_LABELS, components: CHATBOT_THEME_LABELS });
    }
    const theme = await getChatbotTheme();
    return res.json({ theme, labels: CHATBOT_THEME_LABELS, components: CHATBOT_THEME_LABELS });
  } catch (e) {
    console.warn('theme public', e.message);
    return res.json({ theme: DEFAULT_CHATBOT_THEME, labels: CHATBOT_THEME_LABELS, components: CHATBOT_THEME_LABELS });
  }
});

module.exports = { router };
