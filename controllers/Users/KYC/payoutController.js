const MemberModel = require("../../../models/Users/Member");
const axios = require("axios");

// Initiate payout to a beneficiary
exports.initiatePayout = async (req, res) => {
  try {
    const { memberId, amount, transferId } = req.body;

    // Find the member
    const member = await MemberModel.findOne({ Member_id: memberId });

    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    // Check if beneficiary is created
    if (member.beneficiaryStatus !== "CREATED" || !member.beneficiaryId) {
      return res.status(400).json({ 
        message: "Beneficiary not created for this member. Please complete KYC approval first." 
      });
    }

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Valid amount is required" });
    }

    // Validate transferId
    if (!transferId) {
      return res.status(400).json({ message: "Transfer ID is required" });
    }

    // First, authenticate with Cashfree to get Bearer token
    const authResponse = await axios.post(
      "https://payout-api.cashfree.com/payout/v1/authorize",
      {},
      {
        headers: {
          "x-client-id": process.env.CI_APP_ID,
          "x-client-secret": process.env.CI_SECRET_KEY,
          "Content-Type": "application/json",
        }
      }
    );

    // Extract token from response - handle both possible response structures
    const bearerToken = authResponse.data?.data?.token || authResponse.data?.token;
    
    if (!bearerToken) {
      throw new Error(`Failed to extract authorization token from Cashfree. Response: ${JSON.stringify(authResponse.data)}`);
    }

    // Prepare payload for Cashfree API (use `beneId` to reference the previously added beneficiary)
    const payload = {
      amount,
      transferId,
      beneId: member.beneficiaryId
    };

    // Make API call to Cashfree with Bearer token
    const response = await axios.post(
      "https://payout-api.cashfree.com/payout/v1/requestTransfer",
      payload,
      {
        headers: {
          "Authorization": `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        }
      }
    );

    // Return success response
    res.json({
      message: "Payout initiated successfully",
      data: response.data
    });
  } catch (error) {
    console.error("Error initiating payout:", error.response?.data || error.message);
    
    // Handle specific Cashfree errors
    if (error.response) {
      return res.status(error.response.status).json({
        message: "Failed to initiate payout",
        error: error.response.data
      });
    }
    
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get beneficiary status
exports.getBeneficiaryStatus = async (req, res) => {
  try {
    const { memberId } = req.params;

    // Find the member
    const member = await MemberModel.findOne({ Member_id: memberId });

    if (!member) {
      return res.status(404).json({ message: "Member not found" });
    }

    res.json({
      kycStatus: member.kycStatus,
      beneficiaryStatus: member.beneficiaryStatus,
      beneficiaryId: member.beneficiaryId
    });
  } catch (error) {
    console.error("Error fetching beneficiary status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};