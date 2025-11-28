const express = require("express");
const {
  createOrder,
  verifyPayment,
  getIncompletePayment,
  handleWebhook,
  retryPayment,
  handlePaymentRedirect,
  checkPaymentStatus,
  raiseTicket,
  saveIncompletePayment,
  processSuccessfulPayment,
  processFailedPayment
} = require("../controllers/Payments/CashfreeController");
const router = express.Router();


router.post("/create-order", createOrder);
router.get("/verify-payment/:orderId", verifyPayment);
router.get("/incomplete-payments/:memberId", getIncompletePayment);
router.post("/webhook", express.raw({type: 'application/json'}), handleWebhook);
router.post("/retry-payment", retryPayment);
router.get("/redirect", handlePaymentRedirect);
router.get("/status/:orderId", checkPaymentStatus);
router.post("/raise-ticket", raiseTicket);
router.post("/save-incomplete-payment", saveIncompletePayment);
router.post("/process-successful-payment", processSuccessfulPayment);
router.post("/process-failed-payment", processFailedPayment);


module.exports = router;