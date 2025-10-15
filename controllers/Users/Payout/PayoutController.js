import TransactionModel from "../../../models/Transaction/Transaction.js";

// ----------- LEVEL BENEFITS -----------
export const getLevelBenefits = async (req, res) => {
  try {
    const { member_id } = req.params;

    // Fetch all transactions for this member
    const transactions = await TransactionModel.find({ member_id });

    if (!transactions || transactions.length === 0) {
      return res.status(404).json({
        message: "No transactions found for this member",
        member_id
      });
    }

    // Level Benefits: sum of credits for level benefits (case-insensitive)
    const levelBenefits = transactions
      .filter(tx => {
        const type = (tx.transaction_type || "").toLowerCase();
        const desc = (tx.description || "").toLowerCase();
        return type === "level benefits" || desc === "level benefits";
      })
      .reduce((acc, tx) => acc + (Number(tx.ew_credit) || 0), 0);

    res.json({
      member_id,
      totalLevelBenefits: levelBenefits.toFixed(2),
      transactionCount: transactions.length
    });
  } catch (error) {
    console.error("Error fetching level benefits:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// ----------- DAILY PAYOUT -----------
export const getDailyPayout = async (req, res) => {
  try {
    const { member_id } = req.params;

    // Fetch all transactions for this member
    const transactions = await TransactionModel.find({ member_id });

    if (!transactions || transactions.length === 0) {
      return res.status(404).json({
        message: "No transactions found for this member",
        member_id
      });
    }

    // Level Benefits: sum of credits for level benefits (case-insensitive)
    const levelBenefits = transactions
      .filter(tx => {
        const type = (tx.transaction_type || "").toLowerCase();
        const desc = (tx.description || "").toLowerCase();
        return type === "level benefits" || desc === "level benefits";
      })
      .reduce((acc, tx) => acc + (Number(tx.ew_credit) || 0), 0);

    // Direct Benefits: sum of credits for direct benefits (case-insensitive)
    const directBenefits = transactions
      .filter(tx => {
        const type = (tx.transaction_type || "").toLowerCase();
        const desc = (tx.description || "").toLowerCase();
        return type === "direct benefits" || desc === "direct benefits";
      })
      .reduce((acc, tx) => acc + (Number(tx.ew_credit) || 0), 0);

    // Gross profit: sum of both
    const grossProfit = levelBenefits + directBenefits;

    res.json({
      member_id,
      levelBenefits: levelBenefits.toFixed(2),
      directBenefits: directBenefits.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
      transactionCount: transactions.length
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