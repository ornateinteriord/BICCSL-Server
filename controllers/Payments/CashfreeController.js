const axios = require("axios");
const crypto = require("crypto");

const CASHFREE_BASE = "https://sandbox.cashfree.com/pg";
const X_API_VERSION = "2025-01-01";

// Create order (frontend calls this)
exports.createOrder = async (req, res) => {
  try {
    const { amount, customer } = req.body;

    const headers = {
      "Content-Type": "application/json",
      "x-api-version": X_API_VERSION,
      "x-client-id": process.env.CASHFREE_APP_ID,
      "x-client-secret": process.env.CASHFREE_SECRET_KEY,
    };

    const body = {
      order_amount: amount,
      order_currency: "INR",
      customer_details: {
        customer_id: customer?.id || `cust_${Date.now()}`,
        customer_name: customer?.name || "Guest",
        customer_email: customer?.email || "guest@example.com",
        customer_phone: customer?.phone || "9999999999",
      },
    };

    const response = await axios.post(`${CASHFREE_BASE}/orders`, body, { headers });
    res.json(response.data);
  } catch (error) {
    console.error("Error creating Cashfree order:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "Failed to create Cashfree order",
      error: error.response?.data || error.message,
    });
  }
};

// Webhook handler
exports.webhook = (req, res) => {
  try {
    const signature = req.headers["x-webhook-signature"];
    const timestamp = req.headers["x-webhook-timestamp"];
    const secret = process.env.CASHFREE_SECRET_KEY;

    const rawBody = req.body.toString("utf-8") || req.rawBody;
    const payload = `${timestamp}${rawBody}`;
    const genSig = crypto.createHmac("sha256", secret).update(payload).digest("base64");

    if (genSig !== signature) {
      console.warn("❌ Invalid Cashfree signature");
      return res.status(401).send("Invalid signature");
    }

    const data = JSON.parse(rawBody);
    console.log("✅ Verified webhook:", data);

    // TODO: update order/payment status in DB
    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(500).send("Internal error");
  }
};
