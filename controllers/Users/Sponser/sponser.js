const MemberModel = require("../../../models/Users/Member");

const getSponsers = async (req, res) => {
    try {
      const { memberId } = req.user;

      if(!memberId){
        return res.status(400).json({ success: false, message: "Member ID is required" });
      }
  
      // Find all users where Sponsor_code matches the logged-in user's Member_id
      const sponsoredUsers = await MemberModel.find({ Sponsor_code: memberId });
  
      res.json({success :true, sponsoredUsers });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  };

  module.exports = { getSponsers };