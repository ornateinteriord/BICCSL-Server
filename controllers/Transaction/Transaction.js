const  mongoose  = require("mongoose");
const TransactionModel = require("../../models/Transaction/Transaction");
const MemberModel = require("../../models/Users/Member");

const getTransactionDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: "Invalid User ID" });
      }
   
    const transactions = await TransactionModel.find({userId:id});
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
