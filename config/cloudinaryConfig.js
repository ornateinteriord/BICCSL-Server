const cloudinary = require("cloudinary").v2;
require("dotenv").config();

cloudinary.config({
  cloud_name: process.env.VITE_CLOUDINARY_NAME,
  api_key: process.env.VITE_CLOUNDINARY_API_KEY,
  api_secret: process.env.VITE_CLOUNDINARY_API_SECRET,
});

module.exports = cloudinary;
