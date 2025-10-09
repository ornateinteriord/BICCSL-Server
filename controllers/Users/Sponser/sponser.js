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

    const parentUser = await MemberModel.findOne({ Member_id: memberId });

    if (!parentUser) {
      return res.status(404).json({ success: false, message: "Member not found" });
    }

    const sponsoredCount = await MemberModel.countDocuments({ 
      Sponsor_code: memberId 
    });

    const isEligibleForReward = sponsoredCount >= 2;
    
    const rewardMessage = isEligibleForReward 
      ? `Congratulations! You have sponsored ${sponsoredCount} members and are eligible to claim your reward.`
      : `You need to sponsor ${2 - sponsoredCount} more member(s) to become eligible for the reward.`;

    res.json({
      success: true,
      memberId: memberId,
      memberName: parentUser.Name,
      sponsoredCount: sponsoredCount,
      isEligibleForReward: isEligibleForReward,
      message: rewardMessage,
      requiredForEligibility: 2
    });

  } catch (error) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

  module.exports = { getSponsers ,checkSponsorReward };

