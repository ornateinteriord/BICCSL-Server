// const bcrypt = require("bcrypt");
const AdminModel = require("../../models/Admin/Admin");
const MemberModel = require("../../models/Users/Member");

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await MemberModel.findOne({ Member_id: username });
    const admin = await AdminModel.findOne({ username });
    const foundUser = user || admin;
    if (!foundUser) {
      return res
        .status(404)
        .json({ success: false, message: "User or Admin not found" });
    }

    const userRole = user instanceof MemberModel ? "USER" : "ADMIN";

    const isPasswordValid =
      password === (foundUser.PASSWORD || foundUser.password);
    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ success: false, message: "Incorrect username or password" });
    }

    return res.status(200).json({
      success: true,
      role: userRole,
      message: `${
        userRole.charAt(0).toUpperCase() + userRole.slice(1)
      } login successful`,
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

module.exports = login;
