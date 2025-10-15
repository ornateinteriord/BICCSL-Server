const  mongoose  = require("mongoose");
const TransactionModel = require("../../models/Transaction/Transaction");


const getTransactionDetails = async (req, res) => {
  try {
    const loggedInMemberId = req.user.memberId;
    const userRole = req.user.role;

    let query = {};
    
    if (userRole === "ADMIN") {
      query = loggedInMemberId ? { member_id: loggedInMemberId } : {}; // Fetch all transactions if no memberId provided
    } else if (userRole === "USER") {
      query = { member_id: loggedInMemberId };
    }

    const transactions = await TransactionModel.find(query);

   if (!transactions.length) {
  return res.status(200).json({
    success: true,
    message: "No transactions found",
    transactions: [],
  });
}


    return res.status(200).json({ success: true, data: transactions });
  } catch (error) {
    console.error("Error fetching transaction details:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = getTransactionDetails;
