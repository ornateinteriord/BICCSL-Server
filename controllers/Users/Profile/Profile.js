const bcrypt = require("bcrypt");
const MemberModel = require("../../../models/Users/Member");
const mongoose = require("mongoose");

const getMemberDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Member ID" });
    }
    const member = await MemberModel.findById(id);
    if (!member) {
      return res
        .status(404)
        .json({ success: false, message: "Member not found" });
    }
    const { password, ...memberData } = member.toObject();

    return res.status(200).json({ success: true, data: memberData });
  } catch (error) {
    console.error("Error fetching member details:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const UpdateMemberDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { oldPassword, newPassword, ...updateData } = req.body;

    //find the member by ID
    const member = await MemberModel.findById(id);
    if (!member) {
      return res
        .status(404)
        .json({ success: false, message: "Member not found" });
    }

    // Handle password update
    if (oldPassword && newPassword) {
      const isMatch = await bcrypt.compare(oldPassword, member.password);
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

    // update member
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
    console.error("Error updating member details:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = { getMemberDetails, UpdateMemberDetails };
