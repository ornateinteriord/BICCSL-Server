const AdminModel = require("../../models/Admin/Admin");
const MemberModel = require("../../models/Users/Member");
const jwt = require("jsonwebtoken");

const generateUniqueMemberId = async () => {
  while (true) {
    const memberId = `BIC${Math.floor(100000 + Math.random() * 900000)}`;
    if (!(await MemberModel.exists({ Member_id: memberId }))) {
      return memberId;
    }
  }
};

const signup = async (req, res) => {
  try {
    const {  email, ...otherDetails } =
      req.body;
    const existingUser = await MemberModel.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, message: "Email already in use" });
    }

    const memberId = await generateUniqueMemberId();

    const newMember = new MemberModel({
      Member_id: memberId,
      email,
      ...otherDetails
    });
    await newMember.save();
    res.status(201).json({
      success: true,
      message: "Signup successful",
      user: newMember,
    });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ success: false, message: error });
  }
};

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

    const token = jwt.sign(
      {
        id: foundUser._id,
        role: userRole,
        memberId: foundUser?.Member_id ?? null,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );
    return res.status(200).json({
      success: true,
      role: userRole,
      user: foundUser,
      token,
      message: `${
        userRole.charAt(0).toUpperCase() + userRole.slice(1).toLowerCase()
      } login successful`,
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

module.exports = { signup, login };
