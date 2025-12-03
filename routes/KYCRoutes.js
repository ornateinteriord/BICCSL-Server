const express = require("express");
const { submitKYC, approveKYC, getKycSubmissions } = require("../controllers/Users/KYC/kycController");
const { initiatePayout, getBeneficiaryStatus } = require("../controllers/Users/KYC/payoutController");
const router = express.Router();

// Submit KYC details
router.post("/submit", submitKYC);

// Approve KYC
router.post("/approve", approveKYC);

// Get KYC submissions (optional query: ?status=PENDING&q=search&page=1&limit=50)
router.get("/submissions", getKycSubmissions);

// Initiate payout
router.post("/payout", initiatePayout);

// Get beneficiary status
router.get("/beneficiary/:memberId", getBeneficiaryStatus);

module.exports = router;