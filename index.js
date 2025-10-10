const express = require("express");
const cors = require("cors");
require("dotenv").config();
const ImageKit = require('imagekit');
require("./models/db");
const AuthRoutes = require("./routes/AuthRoutes");
const UserRoutes = require("./routes/UserRoutes");
const AdminRoutes = require("./routes/AdminRoute")

const app = express();

//middleware
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb", extended: true }));
app.use(
  cors({
    origin: "*",
    methods: ["POST", "GET", "PUT", "DELETE", "PATCH"],
    credentials: true,
  })
);

let imagekit = null;
if (process.env.IMAGEKIT_PUBLIC_KEY && process.env.IMAGEKIT_PRIVATE_KEY && process.env.IMAGEKIT_URL_ENDPOINT) {
  imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
  });
  console.log('ImageKit initialized successfully');
} else {
  console.log('ImageKit not initialized - missing environment variables');
}

app.get("/image-kit-auth", (_req, res) => {
  if (imagekit) {
    const result = imagekit.getAuthenticationParameters();
    res.send(result);
  } else {
    res.status(500).json({ error: 'ImageKit not configured' });
  }
});
//router
app.use("/auth", AuthRoutes);
app.use("/user", UserRoutes);
app.use("/admin",AdminRoutes);

app.get("/", (req, res) => {
  res.send("Welcome to BICCSL Server");
});

//server
const PORT = process.env.PORT || 5051;
app.listen(PORT, () => {
  console.log(`server is running on ${PORT}`);
});
