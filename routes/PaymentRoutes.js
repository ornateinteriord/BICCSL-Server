const express = require("express");
const router = express.Router();
const { createOrder } = require("../controllers/Payments/CashfreeController");

router.post("/create-order", createOrder);

module.exports = router;
