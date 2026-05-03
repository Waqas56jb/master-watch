const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/protected/payment.controller");

router.get("/",                       ctrl.getPaymentMethods);
router.post("/",                      ctrl.addPaymentMethod);
router.delete("/:id",                 ctrl.deletePaymentMethod);
router.post("/:id/set-default",       ctrl.setDefaultPaymentMethod);

module.exports = router;
