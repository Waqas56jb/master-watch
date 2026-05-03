const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/protected/feedback.controller");

router.get("/questions", ctrl.getFeedbackQuestions);

module.exports = router;
