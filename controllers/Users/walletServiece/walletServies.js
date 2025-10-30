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

    const transactions = await TransactionModel.find({ member_id: memberId });

    const completedAndPendingTx = transactions.filter(tx => 
      tx.status === "Completed" || tx.status === "Pending" || tx.status === "Approved"
    );
    
    const availableBalance = completedAndPendingTx.reduce((acc, tx) => 
      acc + (parseFloat(tx.ew_credit) || 0) - (parseFloat(tx.ew_debit) || 0), 0
    );

    // For display purposes only - total income/expenses from completed transactions
    const completedTx = transactions.filter(tx => tx.status === "Completed");
    const totalIncome = completedTx.reduce((acc, tx) => acc + (parseFloat(tx.ew_credit) || 0), 0);
    const totalExpenses = completedTx.reduce((acc, tx) => acc + (parseFloat(tx.ew_debit) || 0), 0);

    const totalWithdrawal = transactions
      .filter(tx => tx.transaction_type === "Withdrawal" && tx.status === "Completed")
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_debit) || 0), 0);

    const otherDebits = transactions
      .filter(tx => tx.transaction_type !== "Withdrawal" && tx.status === "Completed")
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_debit) || 0), 0);

    const levelBenefits = transactions
      .filter(tx => 
        (tx.transaction_type === "Level benefits" || 
        tx.description === "Level benefits" ||
        tx.transaction_type === "Level Benefits" || 
        tx.description === "Level Benefits") &&
        tx.status === "Completed"
      )
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_credit) || 0), 0);

    const directBenefits = transactions
      .filter(tx => 
        (tx.transaction_type === "Direct Benefits" || 
        tx.description === "Direct Benefits" ||
        tx.transaction_type === "Direct benefits" || 
        tx.description === "Direct benefits") &&
        tx.status === "Completed"
      )
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_credit) || 0), 0);

    // Get pending withdrawals for transparency
    const pendingWithdrawals = transactions
      .filter(tx => tx.transaction_type === "Withdrawal" && tx.status === "Pending")
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_debit) || 0), 0);

    return res.status(200).json({
      success: true,
      data: {
        balance: Math.max(0, availableBalance).toFixed(2),
        totalIncome: totalIncome.toFixed(2),
        totalExpenses: totalExpenses.toFixed(2),
        totalWithdrawal: totalWithdrawal.toFixed(2),
        otherDebits: otherDebits.toFixed(2),
        transactionsCount: transactions.length,
        availableForWithdrawal: Math.max(0, availableBalance).toFixed(2),
        levelBenefits: levelBenefits.toFixed(2),
        directBenefits: directBenefits.toFixed(2),
        totalBenefits: (levelBenefits + directBenefits).toFixed(2),
        pendingWithdrawals: pendingWithdrawals.toFixed(2),
        calculation: {
          formula: "Available Balance = Sum of All Credits - Sum of All Debits (including pending transactions)",
          breakdown: `₹${completedAndPendingTx.reduce((acc, tx) => acc + (parseFloat(tx.ew_credit) || 0), 0).toFixed(2)} - ₹${completedAndPendingTx.reduce((acc, tx) => acc + (parseFloat(tx.ew_debit) || 0), 0).toFixed(2)} = ₹${Math.max(0, availableBalance).toFixed(2)}`,
          note: "Available balance includes both completed and pending transactions. Pending withdrawals: ₹" + pendingWithdrawals.toFixed(2)
        },
      },
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

    const withdrawalAmount = parseFloat(amount);
    if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid withdrawal amount" });
    }

    const member = await MemberModel.findOne({ Member_id: memberId });
    if (!member) return res.status(404).json({ success: false, message: "Member not found" });

    // Get ALL transactions (both Completed and Pending) for balance calculation
    const allTransactions = await TransactionModel.find({ member_id: memberId });

    let totalCredits = 0;
    let totalDebits = 0;

    allTransactions.forEach((tx) => {
      totalCredits += parseFloat(tx.ew_credit) || 0;
      totalDebits += parseFloat(tx.ew_debit) || 0;
    });

    let availableBalance = totalCredits - totalDebits;
    availableBalance = Math.max(0, availableBalance);

    // Benefits calculation from completed transactions only
    const completedTransactions = allTransactions.filter(tx => tx.status === "Completed");
    
    const levelBenefits = completedTransactions
      .filter(tx => 
        tx.transaction_type === "Level benefits" || 
        tx.description === "Level benefits" ||
        tx.transaction_type === "Level Benefits" || 
        tx.description === "Level Benefits"
      )
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_credit) || 0), 0);

    const directBenefits = completedTransactions
      .filter(tx => 
        tx.transaction_type === "Direct Benefits" || 
        tx.description === "Direct Benefits" ||
        tx.transaction_type === "Direct benefits" || 
        tx.description === "Direct benefits"
      )
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_credit) || 0), 0);

    if (withdrawalAmount < 500) {
      return res.status(400).json({ 
        success: false, 
        message: "Minimum withdrawal amount is ₹500",
        minimum: 500
      });
    }

    if (withdrawalAmount > 1000) {
      return res.status(400).json({ 
        success: false, 
        message: "Maximum withdrawal amount is ₹1000",
        maximum: 1000
      });
    }

    if (withdrawalAmount > availableBalance) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance",
        details: {
          requested: withdrawalAmount.toFixed(2),
          available: availableBalance.toFixed(2),
          shortfall: (withdrawalAmount - availableBalance).toFixed(2),
        },
        benefitsBreakdown: {
          levelBenefits: levelBenefits.toFixed(2),
          directBenefits: directBenefits.toFixed(2),
          totalBenefits: (levelBenefits + directBenefits).toFixed(2),
          availableBalance: availableBalance.toFixed(2)
        }
      });
    }

    const deduction = withdrawalAmount * 0.15;
    const netAmount = withdrawalAmount - deduction;

    const lastTransaction = await TransactionModel.findOne({})
      .sort({ createdAt: -1 })
      .exec();

    let newTransactionId = 1;
    if (lastTransaction && lastTransaction.transaction_id) {
      const lastIdNumber = parseInt(lastTransaction.transaction_id.replace(/\D/g, ""), 10) || 0;
      newTransactionId = lastIdNumber + 1;
    }

    const newTransaction = new TransactionModel({
      transaction_id: newTransactionId.toString(),
      transaction_date: new Date(),
      member_id: memberId,
      description: "Withdrawal Request",
      transaction_type: "Withdrawal",
      ew_credit: 0,
      ew_debit: withdrawalAmount,
      status: "Pending",
      deduction: deduction,
      net_amount: netAmount,
      gross_amount: withdrawalAmount,
      benefits_source: {
        level_benefits_used: levelBenefits,
        direct_benefits_used: directBenefits,
        total_benefits_available: levelBenefits + directBenefits
      }
    });

    await newTransaction.save();

    // Calculate new balance including the pending withdrawal
    let newAvailableBalance = availableBalance - withdrawalAmount;
    newAvailableBalance = Math.max(0, newAvailableBalance);

    return res.status(200).json({
      success: true,
      message: "Withdrawal request submitted successfully",
      data: {
        transactionId: newTransaction.transaction_id,
        withdrawalDetails: {
          grossAmount: withdrawalAmount.toFixed(2),
          deduction: deduction.toFixed(2),
          netAmount: netAmount.toFixed(2),
          deductionRate: "15%"
        },
        balanceDetails: {
          previousBalance: availableBalance.toFixed(2),
          withdrawalAmount: withdrawalAmount.toFixed(2),
          newAvailableBalance: newAvailableBalance.toFixed(2)
        },
        benefitsBreakdown: {
          levelBenefits: levelBenefits.toFixed(2),
          directBenefits: directBenefits.toFixed(2),
          totalBenefits: (levelBenefits + directBenefits).toFixed(2),
          benefitsContribution: `${((levelBenefits + directBenefits) / (totalCredits || 1) * 100).toFixed(1)}% of total income`
        },
        status: "Pending",
        calculation: {
          deduction: `15% of ₹${withdrawalAmount.toFixed(2)} = ₹${deduction.toFixed(2)}`,
          netAmount: `₹${withdrawalAmount.toFixed(2)} - ₹${deduction.toFixed(2)} = ₹${netAmount.toFixed(2)}`,
          balanceUpdate: `₹${availableBalance.toFixed(2)} - ₹${withdrawalAmount.toFixed(2)} = ₹${newAvailableBalance.toFixed(2)}`
        },
        note: "Your available balance has been updated and includes this pending withdrawal."
      },
    });
  } catch (error) {
    console.error("Error in getWalletWithdraw:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

module.exports = { getWalletOverview, getWalletWithdraw };