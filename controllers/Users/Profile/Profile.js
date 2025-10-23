const MemberModel = require("../../../models/Users/Member");
const mongoose = require("mongoose");
const AdminModel = require("../../../models/Admin/Admin");
const mlmService = require("../mlmService/mlmService");

const getMemberDetails = async (req, res) => {
  try {
    const  id  = req.user.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid User ID", });
    }
  
    const foundUser = await MemberModel.findById(id)|| await AdminModel.findById(id);
                  
    if (!foundUser) {
      return res
        .status(404)
        .json({ success: false, message: "user not found" });
    }
    if(foundUser instanceof AdminModel){
      const members = await MemberModel.find()
      return res.status(200).json({success:true,data:foundUser,members})
    }
    return res.status(200).json({ success: true, data: foundUser });
  } catch (error) {
    console.error("Error fetching User details:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const activateMemberPackage = async (req, res) => {
  try {
    const { memberId } = req.params;
    
    let query;
    if (mongoose.Types.ObjectId.isValid(memberId)) {
      query = { _id: memberId };
    } else {
      query = { Member_id: memberId };
    }

    // Fetch existing member to detect status change
    const existingMember = await MemberModel.findOne(query);
    if (!existingMember) {
      return res.status(404).json({ 
        success: false, 
        message: "Member not found" 
      });
    }

    const oldStatus = existingMember.status;

    const updatedMember = await MemberModel.findOneAndUpdate(
      query,
      {
        status: 'active',
        spackage: 'standard', 
        package_value: 2600
      },
      { new: true } 
    );

    if (!updatedMember) {
      return res.status(404).json({ 
        success: false, 
        message: "Member not found" 
      });
    }

    // Trigger MLM activation flow only when status changed to active
    if (oldStatus !== "active" && updatedMember.status === "active") {
      try {
        const mlmResult = await mlmService.processMemberActivation(updatedMember.Member_id);
        return res.status(200).json({ 
          success: true, 
          data: updatedMember,
          message: "Package activated successfully",
          mlmResult
        });
      } catch (mlmError) {
        // Return success for activation but include MLM error detail
        return res.status(200).json({ 
          success: true, 
          data: updatedMember,
          mlmError: mlmError.message
        });
      }
    }

    return res.status(200).json({ 
      success: true, 
      data: updatedMember,
      message: "Package activated successfully" 
    });

  } catch (error) {
    console.error("Error activating package:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
};

const getMember = async(req,res)=>{
  try {
    if(req.user.role !== "ADMIN"){
      return res
      .status(403)
      .json({ success: false, message: "Access Denied", });
    }
    const memberId = req.params.memberId
    const member = await MemberModel.findOne({Member_id:memberId})
    if(!member){
      return res
      .status(404)
      .json({ success: false, message: "Member not found", });
    }
    return res.status(200).json({ success: true, member });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

const UpdateMemberDetails = async (req, res) => {
  try {
    let memberId;

    if (req.user.role === "ADMIN") {
      memberId = req.params.memberId; 
    } else {
      memberId = req.user.memberId; 
    }

    if (!memberId) {
      return res.status(400).json({
        success: false,
        message: "Member ID is required",
      });
    }

    const { oldPassword, newPassword, ...updateData } = req.body;

    // Find the user by Member_id (not _id)
    const foundUser = await MemberModel.findOne({ Member_id: memberId });

    if (!foundUser) {
      return res.status(404).json({
        success: false,
        message: "Member not found",
      });
    }

    // Handle password update
    if (oldPassword && newPassword) {
      if (oldPassword !== foundUser.password) {
        return res.status(401).json({
          success: false,
          message: "Old password is incorrect",
        });
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
     
      updateData.password = newPassword;
    }

    // Update user details
    const updatedMember = await MemberModel.findOneAndUpdate(
      { Member_id: memberId },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedMember) {
      return res.status(404).json({
        success: false,
        message: "Member not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Member details updated successfully",
      data: updatedMember,
    });
  } catch (error) {
    console.error("Error updating member details:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
const updateMemberStatus = async (req, res) => {
  try {
    const { memberId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: "Status is required in body" });
    }

    let query;
    if (mongoose.Types.ObjectId.isValid(memberId)) {
      query = { _id: memberId };
    } else {
      query = { Member_id: memberId };
    }

    const existingMember = await MemberModel.findOne(query);
    if (!existingMember) {
      return res.status(404).json({ success: false, message: "Member not found" });
    }

    const oldStatus = existingMember.status;
    const updatedMember = await MemberModel.findOneAndUpdate(query, { status }, { new: true });

    // If status changed to active (from anything else) trigger MLM activation flow
    if (oldStatus !== "active" && status === "active") {
      try {
        const result = await mlmService.processMemberActivation(updatedMember.Member_id);
        return res.status(200).json({
          success: true,
          message: "Member status updated to active",
          data: updatedMember,
          mlmResult: result
        });
      } catch (err) {
        // return success for status update but report mlm error
        return res.status(200).json({
          success: true,
          message: "Member status updated to active (MLM processing failed)",
          data: updatedMember,
          mlmError: err.message
        });
      }
    }

    return res.status(200).json({ success: true, message: "Member status updated", data: updatedMember });
  } catch (error) {
    console.error("Error updating member status:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = { getMemberDetails, UpdateMemberDetails,getMember ,activateMemberPackage, updateMemberStatus};
