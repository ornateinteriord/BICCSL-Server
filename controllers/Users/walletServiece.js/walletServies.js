const TransactionModel = require("../../../models/Transaction/Transaction");
const MemberModel = require("../../../models/Users/Member");

// ------------------ GET WALLET OVERVIEW ------------------
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

    // Fetch all relevant transactions
    const transactions = await TransactionModel.find({
      member_id: memberId,
      status: { $in: ["active", "Completed"] },
    });

    let totalIncome = parseFloat(member.amount) || 0;
    let totalExpenses = 0;
    let totalWithdrawal = 0;
    let otherDebits = 0;

    transactions.forEach((tx) => {
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

    // ✅ Formula changed to addition as you wanted
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
        },
      },
    });
  } catch (error) {
    console.error("Error in getWalletOverview:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// ------------------ GET WALLET WITHDRAW ------------------
const getWalletWithdraw = async (req, res) => {
  try {
    const { memberId, amount } = req.body;

    if (!memberId) return res.status(400).json({ success: false, message: "Member ID is required" });
    if (!amount) return res.status(400).json({ success: false, message: "Withdrawal amount is required" });

    const withdrawalAmount = parseFloat(amount);
    if (isNaN(withdrawalAmount)) {
      return res.status(400).json({ success: false, message: "Invalid withdrawal amount" });
    }

    const member = await MemberModel.findOne({ Member_id: memberId });
    if (!member) return res.status(404).json({ success: false, message: "Member not found" });

    // Fetch transactions (consistent with overview)
    const transactions = await TransactionModel.find({
      member_id: memberId,
      status: { $in: ["active", "Completed"] },
    });

    let totalIncome = parseFloat(member.amount) || 0;
    let totalExpenses = 0;

    transactions.forEach((tx) => {
      totalIncome += parseFloat(tx.ew_credit) || 0;
      totalExpenses += parseFloat(tx.ew_debit) || 0;
    });

    // ✅ Updated formula to match overview
    const currentBalance = totalIncome - totalExpenses;

    // Validation checks
    if (withdrawalAmount < 500) {
      return res.status(400).json({ success: false, message: "Minimum withdrawal amount is ₹500" });
    }

    if (withdrawalAmount > 1000) {
      return res.status(400).json({ success: false, message: "Maximum withdrawal amount is ₹1000" });
    }

    if (withdrawalAmount > currentBalance) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance",
        details: {
          requested: withdrawalAmount,
          available: currentBalance,
          shortfall: (withdrawalAmount - currentBalance).toFixed(2),
        },
      });
    }

    // Calculate deduction and net amount
    const deduction = withdrawalAmount * 0.15;
    const netAmount = withdrawalAmount - deduction;

    // Generate transaction ID safely
    const lastTransaction = await TransactionModel.findOne({})
      .sort({ createdAt: -1 })
      .exec();

    let newTransactionId = 1;
    if (lastTransaction && lastTransaction.transaction_id) {
      const lastIdNumber = parseInt(lastTransaction.transaction_id.replace(/\D/g, ""), 10);
      newTransactionId = lastIdNumber + 1;
    }

    // Create withdrawal transaction
    const newTransaction = new TransactionModel({
      transaction_id: newTransactionId.toString(),
      transaction_date: new Date(),
      member_id: memberId,
      description: "Withdrawal",
      transaction_type: "Withdrawal",
      ew_credit: 0,
      ew_debit: withdrawalAmount,
      status: "Pending",
      deduction,
      net_amount: netAmount,
    });

    await newTransaction.save();

    // ✅ If using addition formula, you must keep it consistent here:
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
          balanceUpdate: `₹${currentBalance.toFixed(2)} - ₹${withdrawalAmount.toFixed(2)} = ₹${newBalance.toFixed(2)}`,
        },
      },
    });
  } catch (error) {
    console.error("Error in getWalletWithdraw:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

module.exports = { getWalletOverview, getWalletWithdraw };
