const MemberModel = require("../../../models/Users/Member");

const getSponsers = async (req, res) => {
    try {
      const { memberId } = req.params

      if(!memberId){
        return res.status(400).json({ success: false, message: "Member ID is required" });
      }
      const parentUser = await MemberModel.findOne(
        { Member_id: memberId }
    );

    if (!parentUser) {
        return res.status(404).json({ success: false, message: "Parent user not found" });
    }
  
      const sponsoredUsers = await MemberModel.aggregate([
        { $match: { Sponsor_code: memberId } }, 
        {
            $project: {
                _id: 0,  
                Member_id: 1,
                Name: 1,
                status: 1,
                Date_of_joining: 1,
                profile_image:1,
                mobileno:1,
                Sponsor_code:1,
                Sponsor_name:1
            }
        }
    ]);
  
      res.json({success :true,  parentUser,sponsoredUsers });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  };

const checkSponsorReward = async (req, res) => {
    try {
        const { memberId } = req.params;

        if (!memberId) {
            return res.status(400).json({ success: false, message: "Member ID is required" });
        }

        // Check if parent user exists
        const parentUser = await MemberModel.findOne({ Member_id: memberId });
        if (!parentUser) {
            return res.status(404).json({ success: false, message: "Member not found" });
        }

        // Count sponsored users
        const sponsorCount = await MemberModel.countDocuments({ Sponsor_code: memberId });
        const isEligible = sponsorCount >= 2;

        // Update eligibility status in database
        if (isEligible !== parentUser.isEligibleForReward) {
            await MemberModel.updateOne(
                { Member_id: memberId },
                { $set: { isEligibleForReward: isEligible } }
            );
        }

        return res.status(200).json({
            success: true,
            memberId,
            sponsorCount,
            isEligible,
            message: isEligible
                ? `Eligible for reward claim (${sponsorCount} sponsored users)`
                : `Not eligible for reward claim. Need ${2 - sponsorCount} more users.`
        });
    } catch (error) {
        console.error("Error checking sponsor reward:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};



  module.exports = { getSponsers ,checkSponsorReward };

