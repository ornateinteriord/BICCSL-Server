const PayoutModel = require("../../../models/Payout/Payout");
const TransactionModel = require("../../../models/Transaction/Transaction");
const MemberModel = require("../../../models/Users/Member");
const {
  updateSponsorReferrals,
  calculateCommissions,
  processCommissions,
  getOrdinal
} = require("../mlmService/mlmService");

const triggerMLMCommissions = async (req, res) => {
  try {


    const { new_member_id, sponsor_code } = req.body;

    if (!new_member_id || !sponsor_code) {
      return res.status(400).json({
        success: false,
        message: "new_member_id and sponsor_code are required"
      });
    }
    const newMember = await TransactionModel.findOne({ member_id: new_member_id });
    if (!newMember) {
      return res.status(404).json({
        success: false,
        message: "New member not found in transactions",
        new_member_id
      });
    }

   
    if (newMember.status && newMember.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: "Cannot process commissions - New member is not active",
        new_member_id: newMember.member_id,
        new_member_name: newMember.Name || newMember.member_name,
        new_member_status: newMember.status,
        required_status: "active"
      });
    }

    let sponsor = await TransactionModel.findOne({ member_code: sponsor_code });
    
    if (!sponsor) {

      sponsor = await TransactionModel.findOne({ member_id: sponsor_code });
    }

    if (!sponsor) {
      return res.status(404).json({
        success: false,
        message: "Sponsor not found in transactions",
        sponsor_code,
        suggestion: "Use member_code or member_id from transaction records"
      });
    }

    console.log(`🚀 Triggering MLM commissions - New: ${new_member_id}, Sponsor: ${sponsor_code} -> ${sponsor.member_id} (${sponsor.Name || sponsor.member_name})`);

    await TransactionModel.findOneAndUpdate(
      { member_id: new_member_id },
      { 
        Sponsor_code: sponsor.member_code, 
        Sponsor_name: sponsor.Name || sponsor.member_name,        
        sponsor_id: sponsor.member_id    
      }
    );

    await updateSponsorReferrals(sponsor.member_id, new_member_id);
    const commissions = await calculateCommissions(new_member_id, sponsor.member_id);

    if (commissions.length === 0) {
      return res.status(200).json({
        success: false,
        message: "No upline sponsors found for commission calculation",
        data: { commissions: [] }
      });
    }

    const results = await processCommissions(commissions);
    const successfulCommissions = results.filter(r => r.success);
    const failedCommissions = results.filter(r => !r.success);
    const totalAmount = successfulCommissions.reduce((sum, comm) => sum + comm.amount, 0);

    return res.status(200).json({
      success: true,
      message: `MLM commissions processed successfully`,
      data: {
        new_member: {
          id: new_member_id,
          name: newMember.Name || newMember.member_name,
          status: newMember.status || 'active'
        },
        sponsor: {
          code: sponsor.member_code,
          id: sponsor.member_id,
          name: sponsor.Name || sponsor.member_name,
          status: sponsor.status || 'active'
        },
        commissions: {
          total_levels: successfulCommissions.length,
          total_commissions: commissions.length,
          successful: successfulCommissions.length,
          failed: failedCommissions.length,
          total_amount: totalAmount,
          breakdown: successfulCommissions.map(comm => ({
            level: comm.level,
            sponsor_id: comm.sponsor_id,
            amount: comm.amount,
            payout_type: `${getOrdinal(comm.level)} Level Benefits`
          })),
          commission_rates: commissionRates,
          failures: failedCommissions
        }
      }
    });

  } catch (error) {
    console.error("❌ Error triggering MLM commissions:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

const getMemberCommissionSummary = async (req, res) => {
  try {
    const { member_id } = req.params;

    // Get all payouts and transactions for the member
    const payouts = await PayoutModel.find({ memberId: member_id });
    const transactions = await TransactionModel.find({ member_id: member_id });

    // Calculate level earnings from payouts
    const levelEarnings = {};
    for (let level = 1; level <= 10; level++) {
      const levelPayouts = payouts.filter(p => p.level === level);
      const levelAmount = levelPayouts.reduce((sum, p) => sum + p.amount, 0);
      
      levelEarnings[`level_${level}`] = {
        count: levelPayouts.length,
        amount: levelAmount,
        type: `${getOrdinal(level)} Level Benefits`,
        rate: commissionRates[level] || 0
      };
    }

    // ✅ Get ALL level benefits from transactions (not just total)
    const levelBenefitsFromTx = {};
    let totalLevelBenefits = 0;

    for (let level = 1; level <= 10; level++) {
      const levelTransactions = transactions.filter(tx => 
        tx.transaction_type === "Level Benefits" && 
        tx.level === level
      );
      
      const levelAmount = levelTransactions.reduce((sum, tx) => sum + (tx.ew_credit || 0), 0);
      totalLevelBenefits += levelAmount;
      
      levelBenefitsFromTx[`level_${level}`] = {
        count: levelTransactions.length,
        amount: levelAmount,
        type: `${getOrdinal(level)} Level Benefits`,
        rate: commissionRates[level] || 0,
        transactions: levelTransactions.slice(0, 5) // Recent 5 transactions for this level
      };
    }

    // ✅ Get member data from Transaction table
    const memberTransaction = await TransactionModel.findOne({ member_id: member_id });
    
    // ✅ Get upline tree with active status information
    const uplineTree = await getUplineTreeService(member_id, 10);

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
        recent_payouts: payouts.slice(0, 10).map(p => ({
          date: p.date,
          type: p.payout_type,
          amount: p.amount,
          level: p.level,
          from_member: p.sponsored_member_id,
          status: p.status
        })),
        // ✅ Additional: Recent level benefit transactions
        recent_level_benefits: transactions
          .filter(tx => tx.transaction_type === "Level Benefits")
          .slice(0, 10)
          .map(tx => ({
            date: tx.date,
            amount: tx.ew_credit,
            level: tx.level,
            from_member: tx.from_member_id,
            description: tx.description
          }))
      }
    });

  } catch (error) {
    console.error("Error getting commission summary:", error);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};



const getDailyPayout = async (req, res) => {
  try {
    const userRole = req.user.role; 
    const loggedInMemberId = req.user.member_id;
    const { member_id } = req.params; 

    console.log("User Role:",userRole);
    console.log("Requested Member ID:",member_id);


    let query = {};


    if (userRole === "ADMIN") {
    
      query = member_id ? { member_id } : {};
    } else if (userRole === "USER") {

      query = { member_id: member_id  };
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

    transactions.forEach(tx => {
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
      if (tx.transaction_type?.toLowerCase().includes("level") || tx.description?.toLowerCase().includes("level")) {
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
    const result = Object.values(dailyEarnings).flatMap(memberDays =>
      Object.values(memberDays).map(day => ({
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

  } catch (error) {
    console.error("Error in getDailyPayout:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};



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

    // Prevent duplicate pending/processing claims
    if (member.upgrade_status === "Processing") {
      return res.status(400).json({
        success: false,
        message: `Loan claim already in status: ${member.upgrade_status}. Please wait for admin review.`,
      });
    }
    const loanAmount = 5000;

    member.upgrade_status = "Processing";
    await member.save();

    const tx = new TransactionModel({
      transaction_id: `RL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      transaction_date: new Date().toISOString(),
      member_id: member.Member_id,
      Name: member.Name,
      mobileno: member.mobileno,
      description: `Reward loan request of ₹${loanAmount}${note ? ` - ${note}` : ""}`,
      transaction_type: "Reward Loan Request",
      ew_credit: loanAmount, 
      ew_debit: "0",
      status: "Processing",
      net_amount: loanAmount,
      benefit_type: "loan",
      previous_balance: "",
      reference_no: `RLREF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      amount: loanAmount
    });

    await tx.save();

    return res.status(200).json({
      success: true,
      message: "Reward loan claimed successfully. Status set to Pending. Admin will process the request.",
      data: {
        member_id: member.Member_id,
        status: member.upgrade_status,
        requested_amount: loanAmount,
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
      status: status 
    })
    .sort({ transaction_date: -1 });

    const totalCount = await TransactionModel.countDocuments({
      transaction_type: "Reward Loan Request",
      status: status 
    });

    return res.status(200).json({
      success: true,
      data: {
        loans, 
        totalCount
      },
    });
  } catch (error) {
    console.error("Error in getRewardLoansByStatus:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
};


const processRewardLoan = async (req, res) => {
  try {
    const { memberId, action } = req.params;

    if (!memberId || !action) {
      return res.status(400).json({
        success: false,
        message: "Member ID and action are required.",
      });
    }

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Invalid action. Use 'approve' or 'reject'.",
      });
    }

    // Find the pending reward loan
    const transaction = await TransactionModel.findOne({
      member_id: memberId,
      transaction_type: "Reward Loan Request",
      status: "Processing"
    }).sort({ transaction_date: -1 });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "No pending reward loan found for this member.",
      });
    }

    const member = await MemberModel.findOne({ Member_id: memberId });
    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Member not found.",
      });
    }

    const now = new Date().toISOString();
    
    if (action === 'approve') {

      transaction.status = "Approved";
      
      const currentBalance = parseFloat(member.wallet_balance) || 0;
      const loanAmount = parseFloat(transaction.amount) || 0;
      member.wallet_balance = currentBalance + loanAmount;
      member.upgrade_status = "Approved";

      transaction.admin_notes = "Loan approved by admin";
    } else {
      transaction.status = "Rejected";
      member.upgrade_status = "Rejected";

      transaction.admin_notes = "Loan rejected by admin";
    }

    transaction.approved_by = "admin";
    transaction.approved_at = now;

    await Promise.all([member.save(), transaction.save()]);

    return res.status(200).json({
      success: true,
      message: `Reward loan ${action}ed successfully.`,
      data: {
        member_id: member.Member_id,
        member_name: member.Name,
        status: transaction.status,
        amount: transaction.amount, 
        transaction_ref: transaction.reference_no,
        ...(action === 'approve' && { 
          new_wallet_balance: member.wallet_balance 
        })
      },
    });

  } catch (error) {
    console.error("Error processing reward loan:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
};

module.exports = {
  triggerMLMCommissions,
  getMemberCommissionSummary,
  getDailyPayout,
  climeRewardLoan,
  getRewardLoansByStatus,
  processRewardLoan
};