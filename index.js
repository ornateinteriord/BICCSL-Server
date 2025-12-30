// ====================== Imports ======================
const express = require("express");
const cors = require("cors");
require("dotenv").config()
const ImageKit = require("imagekit");
require("./models/db"); // Your Mongo DB connection file

// ====================== Routes ======================
const AuthRoutes = require("./routes/AuthRoutes");
const UserRoutes = require("./routes/UserRoutes");
const AdminRoutes = require("./routes/AdminRoute");
const PaymentRoutes = require("./routes/PaymentRoutes");
const KYCRoutes = require("./routes/KYCRoutes");

// 🔐 CASHFREE WEBHOOK CONTROLLER
const { handleWebhook } = require("./controllers/Payments/CashfreeController");

const app = express();

// ======================================================
//        🛡️ CORS CONFIG (Supports Vite + ngrok)
// ======================================================
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://mscs-beige.vercel.app",
  "https://biccsl.vercel.app"
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // Postman / server-to-server

      const isLocalhost = /^http:\/\/localhost:\d+$/.test(origin);
      const isNgrok = origin.endsWith("ngrok-free.dev");

      if (isLocalhost || isNgrok || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS BLOCKED: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);


app.options("*", cors());

// ======================================================
// ⚠️ IMPORTANT: RAW BODY FOR CASHFREE WEBHOOK
// ======================================================
app.use("/webhook/cashfree", express.raw({ type: "*/*" }));

// ======================================================
//        📦 BODY PARSER (normal APIs)
// ======================================================
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// ======================================================
// 💳 CASHFREE WEBHOOK ROUTE (must come AFTER raw body)
// ======================================================
app.post("/webhook/cashfree", handleWebhook);

// ======================================================
//    📷 ImageKit Configuration (Optional but Secure)
// ======================================================
let imagekit = null;

if (
  process.env.IMAGEKIT_PUBLIC_KEY &&
  process.env.IMAGEKIT_PRIVATE_KEY &&
  process.env.IMAGEKIT_URL_ENDPOINT
) {
  imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
  });
  console.log("🖼️ ImageKit initialized");
} else {
  console.warn("⚠️ ImageKit not initialized (missing .env values)");
}

app.get("/image-kit-auth", (_req, res) => {
  if (imagekit) {
    return res.send(imagekit.getAuthenticationParameters());
  }
  return res.status(500).json({ error: "ImageKit not configured" });
});

// ======================================================
//        📌 API ROUTES
// ======================================================
app.use("/auth", AuthRoutes);
app.use("/user", UserRoutes);
app.use("/admin", AdminRoutes);
app.use("/payments", PaymentRoutes);
app.use("/kyc", KYCRoutes);

// ======================================================
//        🏠 HOME
// ======================================================
app.get("/", (req, res) => {
  res.send(`🚀 ${process.env.PROJECT_NAME || "MSCS Server"} Running Securely`);
});

// ======================================================
//        🚀 Start Server
// ======================================================
const PORT = process.env.PORT || 5051;
app.listen(PORT, () => {
  console.log(`🌍 Server running on port ${PORT}`);
});
