const  mongoose  = require("mongoose");
const TransactionModel = require("../../models/Transaction/Transaction");


const getTransactionDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const loggedInUserId = req.user.id;
    const userRole = req.user.role;
    
    if (!mongoose.Types.ObjectId.isValid(loggedInUserId)) {
        return res.status(400).json({ success: false, message: "Invalid User ID" });
      }
       
      if (userRole === "ADMIN") {
        const query = id ? { userId: id } : {}; 
        const transactions = await TransactionModel.find(query);
  
        return res.status(200).json({ success: true, data: transactions });
      }

      if (userRole === "USER" && id !== loggedInUserId) {
        return res.status(403).json({ success: false, message: "transactions Access denied" });
      }
    const transactions = await TransactionModel.find({userId:loggedInUserId});
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
