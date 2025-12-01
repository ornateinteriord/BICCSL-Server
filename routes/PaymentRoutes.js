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
  processFailedPayment,
  processLoanRepayment,
  revertLoanRepayment
} = require("../controllers/Payments/CashfreeController");
const router = express.Router();

// Order management
router.post("/create-order", createOrder);
router.get("/verify-payment/:orderId", verifyPayment);
router.get("/incomplete-payments/:memberId", getIncompletePayment);
router.post("/retry-payment", retryPayment);

// Webhook - uses raw body for signature verification (IMPORTANT: raw body needed for signature)
router.post("/webhook", express.raw({ type: 'application/json' }), handleWebhook);

// Payment status and redirect
router.get("/redirect", handlePaymentRedirect);
router.get("/status/:orderId", checkPaymentStatus);

// Manual payment processing (admin/fallback)
router.post("/process-successful-payment", processSuccessfulPayment);
router.post("/process-failed-payment", processFailedPayment);

// Loan repayment management
router.post("/process-loan-repayment", processLoanRepayment);
router.post("/revert-loan-repayment", revertLoanRepayment);

// Support
router.post("/raise-ticket", raiseTicket);
router.post("/save-incomplete-payment", saveIncompletePayment);

module.exports = router;