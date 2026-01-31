const PayoutModel = require("../../../models/Payout/Payout");
const TransactionModel = require("../../../models/Transaction/Transaction");
const MemberModel = require("../../../models/Users/Member");
const {
  updateSponsorReferrals,
  calculateCommissions,
  processCommissions,
  getOrdinal,
  commissionRates,
  getUplineTree
} = require("../mlmService/mlmService");

// Reusable function to update referral hierarchy when a member becomes active
const updateReferralHierarchy = async (newMemberId, sponsorId) => {
  try {
    const newMember = await MemberModel.findOne({ Member_id: newMemberId });
    if (!newMember) throw new Error(`Member not found: ${newMemberId}`);
    if (newMember.status !== "active") throw new Error(`Member status must be active, current status: ${newMember.status}`);

    const sponsor = await MemberModel.findOne({ Member_id: sponsorId });
    if (!sponsor) throw new Error(`Sponsor not found with ID: ${sponsorId}`);

    if (newMember.sponsor_id !== sponsor.Member_id) {
      await MemberModel.findOneAndUpdate(
        { Member_id: newMemberId },
        { sponsor_id: sponsor.Member_id, Sponsor_code: sponsor.Member_id, Sponsor_name: sponsor.Name }
      );
    }

    await updateSponsorReferrals(sponsor.Member_id, newMemberId);

    return { success: true, new_member: { id: newMemberId }, sponsor: { id: sponsor.Member_id } };
  } catch (error) {
    console.error("❌ Error updating referral hierarchy:", error.message || error);
    throw error;
  }
};

const triggerMLMCommissions = async (req, res) => {
  try {
    const { new_member_id, Sponsor_code } = req.body;

    console.log("🟢 Incoming Request Data (Referral Update Only):", { new_member_id, Sponsor_code });

    if (!new_member_id || !Sponsor_code) {
      return res.status(400).json({
        success: false,
        message: "Member ID and Sponsor code are required"
      });
    }

    // Find new member
    const newMember = await MemberModel.findOne({ Member_id: new_member_id });
    // console.log("📘 Found New Member:", newMember);

    if (!newMember) {
      return res.status(404).json({
        success: false,
        message: `Member not found: ${new_member_id}`
      });
    }

    if (newMember.status !== "active") {
      return res.status(400).json({
        success: false,
        message: `Member status must be active, current status: ${newMember.status}`
      });
    }

    // Find sponsor using Member_id instead of member_code
    const sponsor = await MemberModel.findOne({ Member_id: Sponsor_code });
    console.log("📗 Found Sponsor:", sponsor);

    if (!sponsor) {
      return res.status(404).json({
        success: false,
        message: `Sponsor not found with ID: ${Sponsor_code}`
      });
    }

    // Update member's sponsor details if needed
    if (newMember.sponsor_id !== sponsor.Member_id) {
      await MemberModel.findOneAndUpdate(
        { Member_id: new_member_id },
        {
          sponsor_id: sponsor.Member_id,
          Sponsor_code: sponsor.Member_id,
          Sponsor_name: sponsor.Name
        }
      );
      console.log("🔄 Updated sponsor details for new member:", new_member_id);
    }

    // Update direct sponsor's referrals list
    // THIS IS THE CRITICAL PART FOR HIERARCHY - ONLY THIS RUNS
    await updateSponsorReferrals(sponsor.Member_id, new_member_id);
    console.log("👥 Direct sponsor referrals updated");

    // COMMISSIONS SKIPPED

    return res.status(200).json({
      success: true,
      message: "Referral hierarchy updated successfully (Commissions Disabled)",
      data: {
        new_member: { id: new_member_id },
        sponsor: { id: sponsor.Member_id }
      }
    });

  } catch (error) {
    console.error("❌ Error triggering MLM commissions:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};


const getMemberCommissionSummary = async (req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        member_id: req.params.member_id,
        message: "Commission system is disabled",
        total_earnings: 0,
        level_breakdown: {},
        level_payouts: {},
        upline_tree: [],
        commission_rates: {},
        recent_payouts: [],
        recent_level_benefits: []
      }
    });
    /*
    const { member_id } = req.params;

    // Get all payouts and transactions for the member
    const payouts = await PayoutModel.find({ memberId: member_id });
    const transactions = await TransactionModel.find({ member_id: member_id });

    // Calculate level earnings from payouts
    const levelEarnings = {};
    for (let level = 1; level <= 10; level++) {
      const levelPayouts = payouts.filter((p) => p.level === level);
      const levelAmount = levelPayouts.reduce((sum, p) => sum + p.amount, 0);

      levelEarnings[`level_${level}`] = {
        count: levelPayouts.length,
        amount: levelAmount,
        type: `${getOrdinal(level)} Level Benefits`,
        rate: commissionRates[level] || 0,
      };
    }

    // ✅ Get ALL level benefits from transactions (not just total)
    const levelBenefitsFromTx = {};
    let totalLevelBenefits = 0;

    for (let level = 1; level <= 10; level++) {
      const levelTransactions = transactions.filter(
        (tx) => tx.transaction_type === "Level Benefits" && tx.level === level
      );

      const levelAmount = levelTransactions.reduce(
        (sum, tx) => sum + (tx.ew_credit || 0),
        0
      );
      totalLevelBenefits += levelAmount;

      levelBenefitsFromTx[`level_${level}`] = {
        count: levelTransactions.length,
        amount: levelAmount,
        type: `${getOrdinal(level)} Level Benefits`,
        rate: commissionRates[level] || 0,
        transactions: levelTransactions.slice(0, 5), // Recent 5 transactions for this level
      };
    }

    // ✅ Get member data from Transaction table
    const memberTransaction = await TransactionModel.findOne({
      member_id: member_id,
    });

    // ✅ Get upline tree with active status information
    const uplineTree = await getUplineTree(member_id, 10);

    return res.json({
      success: true,
      data: {
        member_id,
        member_name: memberTransaction?.Name || memberTransaction?.member_name,
        member_code: memberTransaction?.member_code,
        mobile: memberTransaction?.mobileno || memberTransaction?.mobile,
        email: memberTransaction?.email,
        sponsor_code: memberTransaction?.Sponsor_code,
        sponsor_name: memberTransaction?.Sponsor_name,
        direct_referrals: memberTransaction?.direct_referrals?.length || 0,
        total_team: memberTransaction?.total_team || 0,
        total_earnings: totalLevelBenefits,
        level_breakdown: levelBenefitsFromTx, // Using transaction-based data
        level_payouts: levelEarnings, // Payout-based data for comparison
        upline_tree: uplineTree,
        commission_rates: commissionRates,
        recent_payouts: payouts.slice(0, 10).map((p) => ({
          date: p.date,
          type: p.payout_type,
          amount: p.amount,
          level: p.level,
          from_member: p.sponsored_member_id,
          status: p.status,
        })),
        // ✅ Additional: Recent level benefit transactions
        recent_level_benefits: transactions
          .filter((tx) => tx.transaction_type === "Level Benefits")
          .slice(0, 10)
          .map((tx) => ({
            date: tx.date,
            amount: tx.ew_credit,
            level: tx.level,
            from_member: tx.from_member_id,
            description: tx.description,
          })),
      },
    });
    */
  } catch (error) {
    console.error("Error getting commission summary:", error);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

const getDailyPayout = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: { daily_earnings: [] },
      message: "Commission system disabled",
    });
    /*
    const userRole = req.user.role;
    const loggedInMemberId = req.user.member_id;
    const { member_id } = req.params;

    console.log("User Role:", userRole);
    console.log("Requested Member ID:", member_id);

    let query = {};

    if (userRole === "ADMIN") {
      query = member_id ? { member_id } : {};
    } else if (userRole === "USER") {
      query = { member_id: member_id };
    }

    const transactions = await TransactionModel.find({
      ...query,
      $or: [
        { transaction_type: /level benefits|direct benefits/i },
        { description: /level benefits|direct benefits/i },
      ],
    }).sort({ createdAt: 1 });

    if (!transactions.length) {
      return res.status(200).json({
        success: true,
        data: { daily_earnings: [] },
        message: "No transactions found",
      });
    }

    // 🔹 Group by date
    const dailyEarnings = {};

    transactions.forEach((tx) => {
      const date = tx.createdAt.toDateString();
      const memberId = tx.member_id;

      if (!dailyEarnings[memberId]) dailyEarnings[memberId] = {};
      if (!dailyEarnings[memberId][date]) {
        dailyEarnings[memberId][date] = {
          member_id: memberId,
          date,
          level_benefits: 0,
          direct_benefits: 0,
          transactions: [],
        };
      }

      const amount = parseFloat(tx.ew_credit) || 0;
      if (
        tx.transaction_type?.toLowerCase().includes("level") ||
        tx.description?.toLowerCase().includes("level")
      ) {
        dailyEarnings[memberId][date].level_benefits += amount;
      } else {
        dailyEarnings[memberId][date].direct_benefits += amount;
      }

      dailyEarnings[memberId][date].transactions.push({
        type: tx.transaction_type || tx.description,
        amount: tx.ew_credit,
        time: tx.createdAt,
        status: tx.status,
      });
    });

    // 🔹 Flatten for easy consumption
    const result = Object.values(dailyEarnings).flatMap((memberDays) =>
      Object.values(memberDays).map((day) => ({
        ...day,
        gross_profit: (day.level_benefits + day.direct_benefits).toFixed(2),
        level_benefits: day.level_benefits.toFixed(2),
        direct_benefits: day.direct_benefits.toFixed(2),
      }))
    );

    return res.status(200).json({
      success: true,
      data: { daily_earnings: result },
    });
    */
  } catch (error) {
    console.error("Error in getDailyPayout:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

const LOAN_TIERS = [
  { level: 1, amount: 5000, deduction: 250, credit: 4750, installmen_weeks: 10, weekly_payment: 500 },
  { level: 2, amount: 10000, deduction: 600, credit: 9400, installmen_weeks: 10, weekly_payment: 1000 },
  { level: 3, amount: 25000, deduction: 2500, credit: 22500, installmen_weeks: 25, weekly_payment: 1000 },
  { level: 4, amount: 50000, deduction: 5000, credit: 45000, installmen_weeks: 50, weekly_payment: 1000 },
  { level: 5, amount: 100000, deduction: 15000, credit: 85000, installmen_weeks: 50, weekly_payment: 2000 },
];

const climeRewardLoan = async (req, res) => {
  try {
    const { memberId } = req.params;
    const { note } = req.body;

    // Validate request
    if (!memberId) {
      return res.status(400).json({
        success: false,
        message: "Member ID is required.",
      });
    }

    // Find member
    const member = await MemberModel.findOne({ Member_id: memberId });
    if (!member) {
      return res
        .status(404)
        .json({ success: false, message: "Member not found" });
    }

    // Check for any active loan (Pending, Processing, Approved but not fully Paid)
    const activeLoan = await TransactionModel.findOne({
      member_id: memberId,
      transaction_type: "Reward Loan Request",
      $or: [
        { status: "Processing" },
        { status: "Pending" },
        { status: "Approved", repayment_status: { $ne: "Paid" } }
      ]
    });

    if (activeLoan) {
      return res.status(400).json({
        success: false,
        message: "You already have an active or pending loan. Please clear it first.",
      });
    }

    // ELIGIBILITY CHECK: Package Value must be >= 600 (Covers 600 and 1200 packages)
    if (!member.package_value || member.package_value < 600) {
      return res.status(400).json({
        success: false,
        message: "You need a package value of at least 600 to be eligible for a loan.",
      });
    }

    // ELIGIBILITY CHECK: Must have at least 2 Direct Referrals
    if (!member.direct_referrals || member.direct_referrals.length < 2) {
      return res.status(400).json({
        success: false,
        message: "You need at least 2 direct referrals to be eligible for a loan.",
      });
    }

    // Determine Loan Level
    const completedLoansCount = await TransactionModel.countDocuments({
      member_id: memberId,
      transaction_type: "Reward Loan Request",
      status: "Approved",
      repayment_status: "Paid"
    });

    const currentLevelIndex = completedLoansCount;

    if (currentLevelIndex >= LOAN_TIERS.length) {
      return res.status(400).json({
        success: false,
        message: "Maximum loan limit reached. You have completed all loan levels.",
      });
    }

    const loanDetails = LOAN_TIERS[currentLevelIndex];
    const loanAmount = loanDetails.amount;
    console.log("loanDetails", loanDetails);
    console.log("loanDetails", loanAmount);

    member.upgrade_status = "Processing";
    await member.save();

    const tx = new TransactionModel({
      transaction_id: `RL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      transaction_date: new Date().toISOString(),
      member_id: member.Member_id,
      Name: member.Name,
      mobileno: member.mobileno,
      description: `Reward loan request (Level ${loanDetails.level}) of ₹${loanAmount}${note ? ` - ${note}` : ""
        }`,
      transaction_type: "Reward Loan Request",
      ew_credit: loanAmount,
      ew_debit: "0",
      status: "Processing",
      benefit_type: "loan",
      previous_balance: "",
      reference_no: `RLREF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    });

    await tx.save();

    return res.status(200).json({
      success: true,
      message:
        `Reward loan (Level ${loanDetails.level}) claimed successfully. Status set to Processing. Admin will process the request.`,
      data: {
        member_id: member.Member_id,
        status: member.upgrade_status,
        requested_amount: loanAmount,
        level: loanDetails.level,
        transaction_ref: tx.reference_no,
      },
    });
  } catch (error) {
    console.error("Error in climeRewardLoan:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

const getRewardLoansByStatus = async (req, res) => {
  try {
    const { status } = req.params;

    const loans = await TransactionModel.find({
      transaction_type: "Reward Loan Request",
      status: status,
    }).sort({ transaction_date: -1 });

    const totalCount = await TransactionModel.countDocuments({
      transaction_type: "Reward Loan Request",
      status: status,
    });

    return res.status(200).json({
      success: true,
      data: {
        loans,
        totalCount,
      },
    });
  } catch (error) {
    console.error("Error in getRewardLoansByStatus:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const processRewardLoan = async (req, res) => {
  try {
    const { memberId, action } = req.params;

    // ... (Validation and finding transaction/member code remains the same) ...

    // Find the pending reward loan
    const transaction = await TransactionModel.findOne({
      member_id: memberId,
      transaction_type: "Reward Loan Request",
      status: "Processing",
    }).sort({ transaction_date: -1 });

    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    const member = await MemberModel.findOne({ Member_id: memberId });
    // ... (Error handling for member not found remains the same) ...
    if (!member) {
      return res.status(404).json({ success: false, message: "Member not found" });
    }

    const now = new Date().toISOString();

    // STRICT VALIDATION: Determine Correct Loan Level based on history
    // Do not trust the 'ew_credit' in the request as it might be wrong or manipulated
    const completedLoansCount = await TransactionModel.countDocuments({
      member_id: memberId,
      transaction_type: "Reward Loan Request",
      status: "Approved",
      repayment_status: "Paid"
    });

    // Ensure we don't exceed max level
    const currentLevelIndex = Math.min(completedLoansCount, LOAN_TIERS.length - 1);
    const loanDetails = LOAN_TIERS[currentLevelIndex];

    console.log(`🔒 Enforcing Strict Level: ${loanDetails.level} (History Count: ${completedLoansCount})`);
    console.log("Details:", loanDetails);

    const finalLoanAmount = loanDetails.amount;
    const finalCreditAmount = loanDetails.credit;
    const deduction = loanDetails.deduction;

    const updateData = {
      approved_by: "admin",
      approved_at: now
    };

    if (action === "approve") {
      updateData.status = "Approved";

      // FORCE String conversion and log it
      const dueAmountStr = finalLoanAmount.toString();
      console.log(`💰 Setting net_amount (Due) to: ${dueAmountStr} (Type: ${typeof dueAmountStr})`);

      updateData.net_amount = dueAmountStr;
      updateData.ew_credit = finalCreditAmount.toString(); // Ensure string for consistency
      updateData.repayment_status = "Unpaid";
      updateData.admin_notes = `Loan approved. Tier Level: ${loanDetails?.level || 'Custom'}. Deduction: ${deduction}. Credited: ${finalCreditAmount}. Due: ${finalLoanAmount}.`;

      member.upgrade_status = "Approved";
    } else {
      updateData.status = "Rejected";
      updateData.admin_notes = "Loan rejected by admin";

      member.upgrade_status = "Rejected";
    }

    // Force update via MongoDB directly to avoid schema/instance issues
    await TransactionModel.findByIdAndUpdate(transaction._id, { $set: updateData });
    await member.save();

    // Update local object for response
    Object.assign(transaction, updateData);

    return res.status(200).json({
      success: true,
      message: `Reward loan ${action}ed successfully.`,
      data: {
        member_id: member.Member_id,
        member_name: member.Name,
        status: transaction.status,
        amount: transaction.ew_credit,
        transaction_ref: transaction.reference_no,
        ...(action === "approve" && {
          level: loanDetails?.level,
          credited_amount: finalCreditAmount,
          due_amount: finalLoanAmount,
          deduction: deduction
        }),
      },
    });
  } catch (error) {
    console.error("Error processing reward loan:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


const repaymentLoan = async (req, res) => {
  try {
    const { memberId } = req.params;
    const { amount } = req.body;

    if (!memberId) {
      return res.status(400).json({
        success: false,
        message: "Member ID is required for loan repayment.",
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid repayment amount is required.",
      });
    }

    // Find the approved loan transaction
    // Sort by _id descending to get the most recently created one (more reliable than transaction_date)
    let loanTransaction = await TransactionModel.findOne({
      member_id: memberId,
      transaction_type: "Reward Loan Request",
      status: "Approved",
    }).sort({ _id: -1 });

    if (!loanTransaction) {
      return res.status(404).json({
        success: false,
        message: "No approved reward loan found for this member to repay.",
      });
    }

    // Log loan transaction details for debugging
    console.log("📋 Loan transaction details:", {
      _id: loanTransaction._id,
      transaction_id: loanTransaction.transaction_id,
      reference_no: loanTransaction.reference_no,
      net_amount: loanTransaction.net_amount,
      ew_credit: loanTransaction.ew_credit,
      transaction_date: loanTransaction.transaction_date,
      repayment_status: loanTransaction.repayment_status
    });

    // Get the base due amount from the loan transaction
    let baseDueAmount = parseFloat(loanTransaction.net_amount) || parseFloat(loanTransaction.ew_credit) || 0;

    // Find any pending repayment transactions for this loan to adjust the current due amount
    // Note: For manual repayments, we're less likely to have pending transactions, but we'll check for consistency
    const pendingRepayments = await TransactionModel.find({
      member_id: memberId,
      is_loan_repayment: true,
      status: "Pending",
      "repayment_context.original_loan_id": loanTransaction._id
    });

    // Calculate total pending repayment amount
    let pendingRepaymentAmount = 0;
    pendingRepayments.forEach(repayment => {
      pendingRepaymentAmount += parseFloat(repayment.repayment_context.requested_amount) || 0;
    });

    // Adjust current due amount by subtracting pending repayments
    currentDueAmount = baseDueAmount - pendingRepaymentAmount;

    console.log("💳 Current due amount calculation:", {
      base_due_amount: baseDueAmount,
      pending_repayments_count: pendingRepayments.length,
      pending_repayment_amount: pendingRepaymentAmount,
      adjusted_current_due: currentDueAmount
    });

    if (currentDueAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Loan is already fully repaid.",
      });
    }

    // Calculate actual payment and new due amount
    const actualPayment = Math.min(amount, currentDueAmount);
    const newDueAmount = currentDueAmount - actualPayment;

    console.log("📊 Amount calculation:", {
      current_due: currentDueAmount,
      repayment_amount: actualPayment,
      new_due: newDueAmount,
      calculation: `${currentDueAmount} - ${actualPayment} = ${newDueAmount}`
    });

    // Find member details
    const member = await MemberModel.findOne({ Member_id: memberId });

    // Create repayment transaction
    const repaymentTx = new TransactionModel({
      transaction_id: `LR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      transaction_date: new Date().toISOString(),
      member_id: memberId,
      Name: member?.Name || loanTransaction.Name,
      mobileno: member?.mobileno || loanTransaction.mobileno,
      description: `Loan Repayment of ₹${actualPayment}. Remaining Due: ₹${newDueAmount.toFixed(2)}`,
      transaction_type: "Loan Repayment",
      ew_credit: currentDueAmount,
      ew_debit: actualPayment.toFixed(2),
      status: "Completed",
      net_amount: newDueAmount.toFixed(2),
      benefit_type: "repayment",
      reference_no: loanTransaction.reference_no,
    });


    // Update the original loan transaction
    console.log("📋 Updating loan transaction:", {
      _id: loanTransaction._id,
      previous_net_amount: loanTransaction.net_amount,
      new_net_amount: newDueAmount.toFixed(2),
      previous_repayment_status: loanTransaction.repayment_status
    });

    loanTransaction.net_amount = newDueAmount.toFixed(2);
    loanTransaction.repayment_status = newDueAmount <= 0 ? "Paid" : "Partially Paid";

    // Save both transactions
    await Promise.all([repaymentTx.save(), loanTransaction.save()]);

    return res.status(200).json({
      success: true,
      message: `Loan repayment of ₹${actualPayment} processed successfully.`,
      data: {
        member_id: memberId,
        payment_amount: actualPayment,
        new_due_amount: newDueAmount.toFixed(2),
        repayment_status: loanTransaction.repayment_status,
        transaction_ref: repaymentTx.transaction_id,
      },
    });
  } catch (error) {
    console.error("❌ Error in repaymentLoan:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during loan repayment",
      error: error.message,
    });
  }
};

module.exports = {
  triggerMLMCommissions,
  updateReferralHierarchy,
  getMemberCommissionSummary,
  getDailyPayout,
  climeRewardLoan,
  getRewardLoansByStatus,
  processRewardLoan,
  repaymentLoan,
};
