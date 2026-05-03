const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/protected/trip.controller");

router.post("/",                          ctrl.createTrip);
router.get("/",                           ctrl.getTrips);
router.get("/:id",                        ctrl.getTripById);
router.post("/:id/confirm",               ctrl.confirmTrip);
router.post("/:id/cancel",                ctrl.cancelTrip);
router.get("/:id/cancellation-policy",    ctrl.getCancellationPolicy);
router.post("/:id/return",                ctrl.returnTrip);
router.post("/:id/messages",              ctrl.sendMessage);
router.get("/:id/conversation",           ctrl.getConversation);
router.post("/:id/feedback",              ctrl.submitTripFeedback);

module.exports = router;
