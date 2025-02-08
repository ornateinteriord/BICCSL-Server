const bcrypt = require("bcrypt");
const MemberModel = require("../../../models/Users/Member");

const getMemberDetails = async (req, res) => {
  try {
    const { memberId } = req.params;
    const member = await MemberModel.findOne({ Member_id: memberId });
    if (!member) {
      return res
        .status(404)
        .json({ success: false, message: "Member not found" });
    }
    const { password, _id, ...memberData } = member.toObject();

    return res.status(200).json({ success: true, data: memberData });
  } catch (error) {
    console.error("Error fetching member details:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const UpdateMemberDetails = async (req, res) => {
  try {
    const { memberId } = req.params;
    const { oldPassword, newPassword, ...updateData } = req.body;

    const member = await MemberModel.findOne({ Member_id: memberId });
    if (!member) {
      return res
        .status(404)
        .json({ success: false, message: "Member not found" });
    }
    if (oldPassword && newPassword) {
      const isMatch = await bcrypt.compare(oldPassword, member.password);
      if (!isMatch) {
        return res
          .status(401)
          .json({ success: false, message: "Old password is incorrect" });
      }
      if (oldPassword === newPassword) {
        return res
          .status(400)
          .json({
            success: false,
            message: "New password cannot be the same as old password",
          });
      }
      if (newPassword.length <= 5) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Password must be at least 6 characters long",
          });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      updateData.password = hashedPassword;
    }
    const updatedMember = await MemberModel.findOneAndUpdate(
      { Member_id: memberId },
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
