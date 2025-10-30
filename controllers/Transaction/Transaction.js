const mongoose = require("mongoose");
const TransactionModel = require("../../models/Transaction/Transaction");

const getTransactionDetails = async (req, res) => {
  try {
    const loggedInMemberId = req.user.memberId;
    const userRole = req.user.role;
    const { status } = req.query;

    let query = {};
    
    if (userRole === "ADMIN") {
      query = loggedInMemberId ? { member_id: loggedInMemberId } : {};
    } else if (userRole === "USER") {
      query = { member_id: loggedInMemberId };
    }

    if (status && status !== "all") {
      query.status = status;
    }

    const transactions = await TransactionModel.find(query);

    if (!transactions.length) {
      return res.status(200).json({ 
        success: true, 
        message: `No ${status && status !== 'all' ? status + ' ' : ''}transactions found` 
      });
    }
    const today = new Date();
    const dayOfWeek = today.getDay(); 
    const isSaturday = true;
    const isRepayEnabled = true;

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const currentDayName = dayNames[dayOfWeek];
    const enabledDays = "Saturday"; 

    console.log("Backend - Today:", today);
    console.log("Backend - Day of week:", dayOfWeek);
    console.log("Backend - Is Saturday:", isSaturday);
    console.log("Backend - Is repay enabled:", isRepayEnabled);

    return res.status(200).json({ 
      success: true, 
      data: transactions,
      filter: status || 'all',
      repayConfig: {
        isEnabled: isRepayEnabled, 
        enabledDays: enabledDays,
        currentDay: currentDayName,
        message: isRepayEnabled 
          ? `Repayment is available today (${currentDayName})` 
          : `Repayment is only available on ${enabledDays}`
      }
    });
  } catch (error) {
    console.error("Error fetching transaction details:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = getTransactionDetails;