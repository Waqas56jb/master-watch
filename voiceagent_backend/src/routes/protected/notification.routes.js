const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/protected/notification.controller");

router.get("/", ctrl.getNotifications);

module.exports = router;
