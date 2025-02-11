const  mongoose  = require("mongoose");
const TransactionModel = require("../../models/Transaction/Transaction");
const MemberModel = require("../../models/Users/Member");

const getTransactionDetails = async (req, res) => {
  try {
    const { member_id } = req.query;
    if (!member_id) {
      return res.status(400).json({ success: false, message: "Member ID is required" });
    }
    const user = await MemberModel.findOne({ Member_id: member_id })
    if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
   
    const transactions = await TransactionModel.find({userId:user._id});
    if (transactions.length === 0) {
        return res.status(404).json({ success: false, message: "No transactions found for this user" });
      }
   
      return res.status(200).json({ success: true, data: transactions });
  } catch (error) {
    console.error("Error fetching User details:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = getTransactionDetails;
