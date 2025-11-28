const express = require("express");
const cors = require("cors");
require("dotenv").config();
const ImageKit = require("imagekit");
require("./models/db");

// routes
const AuthRoutes = require("./routes/AuthRoutes");
const UserRoutes = require("./routes/UserRoutes");
const AdminRoutes = require("./routes/AdminRoute");
const PaymentRoutes = require("./routes/PaymentRoutes");

const app = express();

/* ------------------- MUST BE ABOVE express.json() ------------------- */
app.post("/payments/webhook", express.raw({ type: "application/json" }));

// Body parser AFTER webhook
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb", extended: true }));
/* -------------------------------------------------------------------- */

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  })
);

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
  console.log(" ImageKit initialized successfully");
} else {
  console.warn(" ImageKit not initialized - missing environment variables");
}

app.get("/image-kit-auth", (_req, res) => {
  if (imagekit) {
    const result = imagekit.getAuthenticationParameters();
    res.send(result);
  } else {
    res.status(500).json({ error: "ImageKit not configured" });
  }
});

app.use("/auth", AuthRoutes);
app.use("/user", UserRoutes);
app.use("/admin", AdminRoutes);
app.use("/payments", PaymentRoutes);

app.get("/", (req, res) => {
  res.send("Welcome to BICCSL Server ");
});

const PORT = process.env.PORT || 5051;
app.listen(PORT, () => {
  console.log(` Server running on port ${PORT}`);
});
