
import PayoutModel from "../../../models/Payout/Payout.js";
import MemberModel from "../../../models/Users/Member.js";

export const getLevelBenefits = async (req, res) => {
  try {
    const { memberId } = req.params;

    // Fetch payout data
    const payoutResult = await PayoutModel.aggregate([
      { $match: { memberId, payout_type: "Level benefits" } },
      { $group: { _id: "$member_id", totalAmount: { $sum: "$amount" } } },
    ]);

    // Fetch member details
    const member = await MemberModel.findOne({ memberId }).select(
      "member_id first_name last_name email mobile status"
    );

    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    const totalAmount = payoutResult.length > 0 ? payoutResult[0].totalAmount : 0;

    res.json({
      member,
      totalAmount,
    });
  } catch (error) {
    console.error("Error fetching level benefits:", error);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * ✅ getDailyPayout
 * Returns Level + Direct Benefits (gross profit) + member details
 */
export const getDailyPayout = async (req, res) => {
  try {
    const { memberId } = req.params;

    // Fetch payout data
    const payoutResult = await PayoutModel.aggregate([
      {
        $match: {
          memberId,
          payout_type: { $in: ["Level benefits", "Direct Benefits"] },
        },
      },
      {
        $group: {
          _id: "$member_id",
          levelAmount: {
            $sum: {
              $cond: [{ $eq: ["$payout_type", "Level benefits"] }, "$amount", 0],
            },
          },
          directAmount: {
            $sum: {
              $cond: [{ $eq: ["$payout_type", "Direct Benefits"] }, "$amount", 0],
            },
          },
          grossProfit: { $sum: "$amount" },
        },
      },
    ]);

    // Fetch member details
    const member = await MemberModel.findOne({ member_id }).select(
      "member_id first_name last_name email mobile status"
    );

    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    const payoutData =
      payoutResult.length > 0
        ? payoutResult[0]
        : { levelAmount: 0, directAmount: 0, grossProfit: 0 };

    res.json({
      member,
      ...payoutData,
    });
  } catch (error) {
    console.error("Error fetching daily payout:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// ✅ Optional default export
export default {
  getLevelBenefits,
  getDailyPayout,
};
