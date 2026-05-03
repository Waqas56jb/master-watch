const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/protected/account.controller");

router.get("/",       ctrl.getAccount);
router.post("/logout", ctrl.logout);

module.exports = router;
