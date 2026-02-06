// ====================== Imports ======================
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
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
const ChatRoutes = require("./routes/ChatRoutes");

// 🔐 CASHFREE WEBHOOK CONTROLLER
const { handleWebhook } = require("./controllers/Payments/CashfreeController");
const connectDB = require("./models/db");
const initializeChatSocket = require("./sockets/chat.socket");

const app = express();
const server = http.createServer(app);

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('❌ Database Connection Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Database connection failed. Please try again.'
    });
  }
});

// ======================================================
//        🔌 SOCKET.IO SETUP
// ======================================================
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // Postman / server-to-server

      const isLocalhost = /^http:\/\/localhost:\d+$/.test(origin);
      const isNgrok = origin?.endsWith("ngrok-free.dev");
      const allowedOrigins = [
        process.env.FRONTEND_URL,
        "https://mscs-beige.vercel.app",
        "https://biccsl.vercel.app"
      ].filter(Boolean);

      if (isLocalhost || isNgrok || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`WebSocket CORS BLOCKED: ${origin}`));
    },
    credentials: true
  }
});

// Initialize chat socket handlers
initializeChatSocket(io);
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
app.use("/chat", ChatRoutes);

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

const startServer = async () => {
  try {
    await connectDB();
    console.log("✅ MongoDB connected");

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🌍 Server running on port ${PORT}`);
      console.log("🔔 Cashfree webhook ready");
      console.log("💬 WebSocket server ready");
    });
  } catch (error) {
    console.error("❌ Server failed:", error.message);
    process.exit(1);
  }
};

// Start server (Vercel handles this differently)
if (process.env.VERCEL !== "1") {
  startServer();
} else {
  // For Vercel, just export the app
  module.exports = app;
}
