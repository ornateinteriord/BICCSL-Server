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
    return res.status(200).json({ success: true, data: member });
  } catch (error) {
    console.error("Error fetching member details:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const UpdateMemberDetails = async (req, res) => {
  try {
    const { memberId } = req.params;
    const updateData = req.body;
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
