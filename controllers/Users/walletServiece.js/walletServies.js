const TransactionModel = require("../../../models/Transaction/Transaction");
const MemberModel = require("../../../models/Users/Member");

const getWalletOverview = async (req, res) => {
  try {
    const { memberId } = req.params;

    if (!memberId) {
      return res.status(400).json({ success: false, message: "Member ID is required" });
    }

    const member = await MemberModel.findOne({ Member_id: memberId });
    if (!member) {
      return res.status(404).json({ success: false, message: "Member not found" });
    }

    // Include both active and completed transactions for balance calculation
    const transactions = await TransactionModel.find({
      member_id: memberId,
      status: { $in: ["active", "Completed"] } // Include completed transactions
    });

    let totalIncome = 0;
    let totalExpenses = 0;
    let totalWithdrawal = 0;
    let otherDebits = 0;

    transactions.forEach(tx => {
      const credit = parseFloat(tx.ew_credit) || 0;
      const debit = parseFloat(tx.ew_debit) || 0;

      totalIncome += credit;
      
      if (debit > 0) {
        if (tx.transaction_type === "Withdrawal") {
          totalWithdrawal += debit;
        } else {
          otherDebits += debit;
        }
      }
    });

    totalExpenses = totalWithdrawal + otherDebits;
    const availableBalance = totalIncome - totalExpenses;

    return res.status(200).json({
      success: true,
      data: {
        balance: availableBalance.toFixed(2),
        totalIncome: totalIncome.toFixed(2),
        totalExpenses: totalExpenses.toFixed(2),
        totalWithdrawal: totalWithdrawal.toFixed(2),
        otherDebits: otherDebits.toFixed(2),
        transactions,
        calculation: {
          formula: "Available Balance = Total Income - Total Expenses",
          breakdown: `₹${totalIncome.toFixed(2)} - ₹${totalExpenses.toFixed(2)} = ₹${availableBalance.toFixed(2)}`,
          expenseBreakdown: `Expenses (₹${totalExpenses.toFixed(2)}) = Withdrawals (₹${totalWithdrawal.toFixed(2)}) + Other Debits (₹${otherDebits.toFixed(2)})`
        }
      }
    });

  } catch (error) {
    console.error("Error in getWalletOverview:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

const getWalletWithdraw = async (req, res) => {
  try {
    const { memberId, amount } = req.body;

    if (!memberId) return res.status(400).json({ success: false, message: "Member ID is required" });
    if (!amount) return res.status(400).json({ success: false, message: "Withdrawal amount is required" });

    const member = await MemberModel.findOne({ Member_id: memberId });
    if (!member) return res.status(404).json({ success: false, message: "Member not found" });

    // Get current balance using the same logic as getWalletOverview
    const transactions = await TransactionModel.find({ 
      member_id: memberId, 
      status: { $in: ["active", "Completed"] } // Consistent with overview
    });
    
    let totalIncome = 0;
    let totalExpenses = 0;

    transactions.forEach(tx => {
      totalIncome += parseFloat(tx.ew_credit) || 0;
      totalExpenses += parseFloat(tx.ew_debit) || 0;
    });

    const currentBalance = totalIncome - totalExpenses;
    const withdrawalAmount = parseFloat(amount);

    // Validation checks
    if (withdrawalAmount > currentBalance) {
      return res.status(400).json({ 
        success: false, 
        message: "Insufficient balance",
        details: {
          requested: withdrawalAmount,
          available: currentBalance,
          shortfall: (withdrawalAmount - currentBalance).toFixed(2)
        }
      });
    }

    if (withdrawalAmount < 500) {
      return res.status(400).json({ success: false, message: "Minimum withdrawal amount is ₹500" });
    }
    
    if (withdrawalAmount > 1000) {
      return res.status(400).json({ success: false, message: "Maximum withdrawal amount is ₹1000" });
    }

    // Check daily withdrawal limit - include both Pending and Completed
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));
    
    const todayWithdrawal = await TransactionModel.findOne({
      member_id: memberId,
      transaction_type: "Withdrawal",
      createdAt: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ["Pending", "Completed"] }
    });

    if (todayWithdrawal) {
      return res.status(400).json({ success: false, message: "Only one withdrawal allowed per day" });
    }

    // Calculate deduction and net amount
    const deduction = withdrawalAmount * 0.15;
    const netAmount = withdrawalAmount - deduction;

    // Generate transaction ID
    const lastTransaction = await TransactionModel.findOne({})
      .sort({ createdAt: -1 }) 
      .exec();

    let newTransactionId = 1;
    if (lastTransaction && lastTransaction.transaction_id) {
      const lastIdNumber = parseInt(lastTransaction.transaction_id.replace(/\D/g, ''), 10);
      newTransactionId = lastIdNumber + 1;
    }

    // Create withdrawal transaction with Completed status
    const newTransaction = new TransactionModel({
      transaction_id: `TXN${newTransactionId.toString().padStart(6, '0')}`,
      transaction_date: new Date(),
      member_id: memberId,
      description: `Withdrawal - Net: ₹${netAmount.toFixed(2)} after 15% deduction`,
      transaction_type: "Withdrawal",
      ew_credit: "0",
      ew_debit: withdrawalAmount.toFixed(2),
      status: "Completed",
      deduction: deduction.toFixed(2),
      net_amount: netAmount.toFixed(2)
    });

    await newTransaction.save();

    // Calculate new balance after withdrawal
    const newBalance = currentBalance - withdrawalAmount;

    return res.status(200).json({
      success: true,
      message: "Withdrawal completed successfully",
      data: { 
        withdrawalAmount: withdrawalAmount.toFixed(2), 
        deduction: deduction.toFixed(2), 
        netAmount: netAmount.toFixed(2), 
        transactionId: newTransaction.transaction_id,
        previousBalance: currentBalance.toFixed(2),
        newBalance: newBalance.toFixed(2),
        calculation: {
          withdrawal: withdrawalAmount.toFixed(2),
          deduction: `15% of ₹${withdrawalAmount.toFixed(2)} = ₹${deduction.toFixed(2)}`,
          netAmount: `₹${withdrawalAmount.toFixed(2)} - ₹${deduction.toFixed(2)} = ₹${netAmount.toFixed(2)}`,
          balanceUpdate: `₹${currentBalance.toFixed(2)} - ₹${withdrawalAmount.toFixed(2)} = ₹${newBalance.toFixed(2)}`
        }
      }
    });

  } catch (error) {
    console.error("Error in getWalletWithdraw:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

module.exports = { getWalletOverview, getWalletWithdraw };