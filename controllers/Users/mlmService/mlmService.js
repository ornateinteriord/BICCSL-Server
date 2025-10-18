const MemberModel = require("../../../models/Users/Member");
const PayoutModel = require("../../../models/Payout/Payout");
const TransactionModel = require("../../../models/Transaction/Transaction");

const commissionRates = {
  1: 25,
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
        sponsor_name: sponsor.Name, // ✅ Use Name field
        sponsored_member_id: currentMemberId,
        sponsor_status: sponsor.status // ✅ Include status for checking
      });
      
      currentMemberId = sponsor.Member_id;
    } else {
      break;
    }
  }

  console.log(`🔍 Found ${uplineSponsors.length} upline sponsors for ${memberId}`);
  return uplineSponsors;
};

const calculateCommissions = async (newMemberId, sponsorId) => {
  try {
    console.log(`🎯 Calculating commissions for new member: ${newMemberId}, sponsored by: ${sponsorId}`);

    const uplineSponsors = await findUplineSponsors(newMemberId, 10);
    
    if (uplineSponsors.length === 0) {
      console.log("❌ No upline sponsors found");
      return [];
    }

    const commissions = [];
    
    for (const upline of uplineSponsors) {
      // ✅ CHECK IF SPONSOR STATUS IS 'active' (lowercase as per your schema)
      if (upline.sponsor_status !== 'active') {
        console.log(`⏸️ Skipping level ${upline.level} - Sponsor ${upline.sponsor_id} status: ${upline.sponsor_status}`);
        continue; // Skip inactive sponsors
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
          description: `Level ${upline.level} commission from ${newMemberId}`,
          sponsor_status: upline.sponsor_status // ✅ Include status
        });
      }
    }

    console.log(`💰 Generated ${commissions.length} commission records for 10 levels (₹25 each)`);
    
    commissions.forEach(comm => {
      console.log(`   Level ${comm.level}: ${comm.sponsor_id} (${comm.Sponsor_code}) → ₹${comm.amount} (Status: ${comm.sponsor_status})`);
    });

    return commissions;

  } catch (error) {
    console.error("❌ Error calculating commissions:", error);
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
          console.log(`⏸️ Commission skipped - Sponsor ${commission.sponsor_id} is not active (Status: ${sponsor?.status || 'not found'})`);
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

        console.log(`✅ Level ${commission.level} commission processed for ${commission.sponsor_id} (${commission.Sponsor_code}): ₹${commission.amount} (Status: ${commission.sponsor_status})`);

      } catch (error) {
        console.error(`❌ Error processing commission for ${commission.sponsor_id}:`, error);
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
    console.error("❌ Error processing commissions:", error);
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
      transaction_id: `TXN${newTransactionId.toString().padStart(6, '0')}`,
      transaction_date: new Date(),
      member_id: memberId,
      reference_no: payout_id.toString(),
      description: `${payout_type} - From member ${new_member_id}`,
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
    console.error("❌ Error creating level benefits transaction:", error);
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
    console.log(`✅ Updated referrals for sponsor: ${sponsorId}`);
  } catch (error) {
    console.error("❌ Error updating sponsor referrals:", error);
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
          status: sponsor.status, // ✅ Include status
          direct_referrals: sponsor.direct_referrals || [],
          total_team: sponsor.total_team || 0,
          commission_rate: commissionRates[level],
          eligible: sponsor.status === 'active' // ✅ Show eligibility
        });
        
        currentMemberId = sponsor.Member_id;
      } else {
        break;
      }
    }

    return tree;
  } catch (error) {
    console.error("Error getting upline tree:", error);
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
  getCommissionSummary
};