const MemberModel = require("../../../models/Users/Member");
const PayoutModel = require("../../../models/Payout/Payout");
const TransactionModel = require("../../../models/Transaction/Transaction");

const commissionRates = {
  1: 100,
  2: 25,
  3: 25,
  4: 25,
  5: 25,
  6: 25,
  7: 25,
  8: 25,
  9: 25,
  10: 25
};

const getOrdinal = (number) => {
  const suffixes = ["th", "st", "nd", "rd"];
  const value = number % 100;
  return number + (suffixes[(value - 20) % 10] || suffixes[value] || suffixes[0]);
};

const findUplineSponsors = async (memberId, maxLevels = 10) => {
  const uplineSponsors = [];
  let currentMemberId = memberId;
  let level = 0;

  while (level < maxLevels) {
    const currentMember = await MemberModel.findOne({ Member_id: currentMemberId });
    
    if (!currentMember || !currentMember.sponsor_id) {
      break;
    }

    const sponsor = await MemberModel.findOne({ Member_id: currentMember.sponsor_id });
    if (sponsor) {
      level++;
      uplineSponsors.push({
        level: level,
        sponsor_id: sponsor.Member_id,
        Sponsor_code: sponsor.member_code, 
        sponsor_name: sponsor.Name,
        sponsored_member_id: currentMemberId,
        sponsor_status: sponsor.status 
      });
      
      currentMemberId = sponsor.Member_id;
    } else {
      break;
    }
  }

  return uplineSponsors;
};

const calculateCommissions = async (newMemberId, sponsorId) => {
  try {

    const uplineSponsors = await findUplineSponsors(newMemberId, 10);
    
    if (uplineSponsors.length === 0) {
      return [];
    }

    const commissions = [];
    
    for (const upline of uplineSponsors) {
      if (upline.sponsor_status !== 'active') {
    
        continue;
      }

      const commissionAmount = commissionRates[upline.level] || 0;
      
      if (commissionAmount > 0) {
        commissions.push({
          level: upline.level,
          sponsor_id: upline.sponsor_id,
          Sponsor_code: upline.Sponsor_code, // ✅ Include sponsor code
          sponsor_name: upline.sponsor_name, // ✅ Include sponsor name
          sponsored_member_id: upline.sponsored_member_id,
          new_member_id: newMemberId,
          amount: commissionAmount,
          payout_type: `${getOrdinal(upline.level)} Level Benefits`,
          description: `Level ${upline.level}`,
          sponsor_status: upline.sponsor_status // ✅ Include status
        });
      }
    }

  

    return commissions;

  } catch (error) {
    throw error;
  }
};

// ✅ PROCESS COMMISSIONS (CREATE PAYOUTS + TRANSACTIONS) - WITH STATUS CHECK
const processCommissions = async (commissions) => {
  try {
    const results = [];
    
    for (const commission of commissions) {
      try {
     
        const sponsor = await MemberModel.findOne({ Member_id: commission.sponsor_id });
        
        if (!sponsor || sponsor.status !== 'active') {
          results.push({
            success: false,
            level: commission.level,
            sponsor_id: commission.sponsor_id,
            error: `Sponsor status is not active (${sponsor?.status || 'not found'})`
          });
          continue;
        }

        const payoutId = Date.now() + Math.floor(Math.random() * 1000) + commission.level;

        // Create Payout Record
        const payout = new PayoutModel({
          payout_id: payoutId,
          date: new Date().toISOString().split('T')[0],
          memberId: commission.sponsor_id,
          payout_type: commission.payout_type,
          ref_no: commission.new_member_id,
          amount: commission.amount,
          level: commission.level,
          sponsored_member_id: commission.new_member_id,
          sponsor_id: commission.sponsor_id,
          status: "Completed",
          description: commission.description,
          sponsor_status: commission.sponsor_status 
        });

        await payout.save();

        // Create Transaction Record
        const transaction = await createLevelBenefitsTransaction({
          payout_id: payoutId,
          memberId: commission.sponsor_id,
          payout_type: commission.payout_type,
          amount: commission.amount,
          level: commission.level,
          new_member_id: commission.new_member_id
        });

        results.push({
          success: true,
          level: commission.level,
          sponsor_id: commission.sponsor_id,
          Sponsor_code: commission.Sponsor_code,
          sponsor_status: commission.sponsor_status,
          amount: commission.amount,
          payout: payout,
          transaction: transaction
        });

  

      } catch (error) {
        results.push({
          success: false,
          level: commission.level,
          sponsor_id: commission.sponsor_id,
          error: error.message
        });
      }
    }

    return results;

  } catch (error) {
    throw error;
  }
};

// ✅ CREATE LEVEL BENEFITS TRANSACTION
const createLevelBenefitsTransaction = async (transactionData) => {
  try {
    const { payout_id, memberId, payout_type, amount, level, new_member_id } = transactionData;

    const lastTransaction = await TransactionModel.findOne({}).sort({ createdAt: -1 });
    let newTransactionId = 1;
    if (lastTransaction && lastTransaction.transaction_id) {
      const lastIdNumber = parseInt(lastTransaction.transaction_id.replace(/\D/g, ""), 10) || 0;
      newTransactionId = lastIdNumber + 1;
    }

    const transaction = new TransactionModel({
      transaction_id: newTransactionId.toString(),
      transaction_date: new Date(),
      member_id: memberId,
      reference_no: payout_id.toString(),
      description: payout_type,
      transaction_type: "Level Benefits",
      ew_credit: amount,
      ew_debit: 0,
      status: "Completed",
      level: level,
      related_member_id: new_member_id,
      related_payout_id: payout_id
    });

    await transaction.save();
    return transaction;

  } catch (error) {
    throw error;
  }
};

// ✅ UPDATE SPONSOR'S DIRECT REFERRALS
const updateSponsorReferrals = async (sponsorId, newMemberId) => {
  try {
    // Check if sponsor has direct_referrals field, if not create it
    const sponsor = await MemberModel.findOne({ Member_id: sponsorId });
    let directReferrals = sponsor.direct_referrals || [];
    
    if (!directReferrals.includes(newMemberId)) {
      directReferrals.push(newMemberId);
    }

    await MemberModel.findOneAndUpdate(
      { Member_id: sponsorId },
      { 
        direct_referrals: directReferrals,
        $inc: { total_team: 1 }
      }
    );

  } catch (error) {
 
    throw error;
  }
};

// ✅ GET UPLINE TREE (FOR VISUALIZATION)
const getUplineTree = async (memberId, maxLevels = 10) => {
  try {
    const tree = [];
    let currentMemberId = memberId;
    let level = 0;

    while (level < maxLevels) {
      const currentMember = await MemberModel.findOne({ Member_id: currentMemberId });
      
      if (!currentMember || !currentMember.sponsor_id) {
        break;
      }

      const sponsor = await MemberModel.findOne({ Member_id: currentMember.sponsor_id });
      if (sponsor) {
        level++;
        tree.push({
          level: level,
          member_id: sponsor.Member_id,
          name: sponsor.Name,
          member_code: sponsor.member_code,
          status: sponsor.status, 
          direct_referrals: sponsor.direct_referrals || [],
          total_team: sponsor.total_team || 0,
          commission_rate: commissionRates[level],
          eligible: sponsor.status === 'active'
        });
        
        currentMemberId = sponsor.Member_id;
      } else {
        break;
      }
    }

    return tree;
  } catch (error) {

    throw error;
  }
};

// ✅ GET COMMISSION SUMMARY
const getCommissionSummary = () => {
  return {
    total_levels: 10,
    commission_per_level: 25,
    total_potential: 250,
    rates: commissionRates,
    condition: "Commissions only for sponsors with 'active' status"
  };
};

// ✅ PROCESS MEMBER ACTIVATION
const processMemberActivation = async (activatedMemberId) => {
  try {

    const member = await MemberModel.findOne({ Member_id: activatedMemberId });
    if (!member) {
      return { success: false, message: "Member not found" };
    }

    let sponsor = null;
    if (member.sponsor_id) {
      sponsor = await MemberModel.findOne({ Member_id: member.sponsor_id });
    }

    if (!sponsor) {
      return { success: false, message: "Sponsor not found" };
    }

    // Only give the referral payout if sponsor is active
    if (sponsor.status !== "active") {
      await updateSponsorReferrals(sponsor.Member_id, member.Member_id).catch(e => console.error(e));
      return { success: false, message: "Sponsor not active; payout skipped" };
    }

    // Use level-1 commission rate (fallback to 0)
    const amount = commissionRates[1] || 0;
    if (amount <= 0) {
      return { success: false, message: "No commission configured for level 1" };
    }

    const payoutId = Date.now() + Math.floor(Math.random() * 1000) + 1;

    const payout = new PayoutModel({
      payout_id: payoutId,
      date: new Date().toISOString().split("T")[0],
      memberId: sponsor.Member_id,
      payout_type: `1st Level Benefits`,
      ref_no: member.Member_id,
      amount: amount,
      level: 1,
      sponsored_member_id: member.Member_id,
      sponsor_id: sponsor.Member_id,
      status: "Completed",
      description: `Direct referral commission from ${member.Member_id}`
    });

    await payout.save();

    const transaction = await createLevelBenefitsTransaction({
      payout_id: payoutId,
      memberId: sponsor.Member_id,
      payout_type: payout.payout_type,
      amount: amount,
      level: 1,
      new_member_id: member.Member_id
    });

    // Update sponsor's direct referrals / team counts
    await updateSponsorReferrals(sponsor.Member_id, member.Member_id);

    return {
      success: true,
      payout,
      transaction
    };

  } catch (error) {
    throw error;
  }
};

// ✅ EXPORT ALL FUNCTIONS
module.exports = {
  commissionRates,
  getOrdinal,
  findUplineSponsors,
  createLevelBenefitsTransaction,
  updateSponsorReferrals,
  calculateCommissions,
  processCommissions,
  getUplineTree,
  getCommissionSummary,
  processMemberActivation
};