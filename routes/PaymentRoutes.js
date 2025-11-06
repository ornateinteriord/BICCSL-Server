const express = require("express");
const { createOrder } = require("../controllers/Payments/CashfreeController");
const router = express.Router();


router.post("/create-order", createOrder);


module.exports = router;
