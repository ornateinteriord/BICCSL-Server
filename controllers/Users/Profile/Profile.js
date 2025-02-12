const bcrypt = require("bcrypt");
const MemberModel = require("../../../models/Users/Member");
const mongoose = require("mongoose");
const AdminModel = require("../../../models/Admin/Admin");

const getMemberDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid User ID" });
    }
    const foundUser = await MemberModel.findById(id) || await AdminModel.findById(id);
                  
    if (!foundUser) {
      return res
        .status(404)
        .json({ success: false, message: "Member not found" });
    }
    const { password, ...memberData } = foundUser.toObject();

    return res.status(200).json({ success: true, data: memberData });
  } catch (error) {
    console.error("Error fetching User details:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const UpdateMemberDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { oldPassword, newPassword, ...updateData } = req.body;

    //find the foundUser by ID
    const foundUser = await MemberModel.findById(id);
    if (!foundUser) {
      return res
        .status(404)
        .json({ success: false, message: "Member not found" });
    }

    // Handle password update
    if (oldPassword && newPassword) {
      const isMatch = await bcrypt.compare(oldPassword, foundUser.password);
      if (!isMatch) {
        return res
          .status(401)
          .json({ success: false, message: "Old password is incorrect" });
      }
      if (oldPassword === newPassword) {
        return res.status(400).json({
          success: false,
          message: "New password cannot be the same as old password",
        });
      }
      if (newPassword.length <= 5) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 6 characters long",
        });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      updateData.password = hashedPassword;
    }

    // update foundUser
    const updatedMember = await MemberModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
    if (!updatedMember) {
      return res
        .status(404)
        .json({ success: false, message: "Member not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Member details updated successfully",
      data: updatedMember,
    });
  } catch (error) {
    console.error("Error updating foundUser details:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = { getMemberDetails, UpdateMemberDetails };
