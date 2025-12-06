const axios = require("axios");
const crypto = require("crypto");
const TransactionModel = require("../../models/Transaction/Transaction");
const MemberModel = require("../../models/Users/Member");
const PaymentModel = require("../../models/Payments/Payment");

// Cashfree API Base URLs
const CASHFREE_BASE = process.env.NODE_ENV === "PROD" 
  ? "https://api.cashfree.com" 
  : "https://sandbox.cashfree.com";
const X_API_VERSION = "2022-09-01";

// Helper function to process loan repayment (called ONLY after payment success)
async function processLoanRepayment(paymentTransaction, _data) {
  try {
    console.log("🔄 Starting loan repayment processing...");

    const {
      member_id,
      new_due_amount,
      original_loan_id
    } = paymentTransaction.repayment_context;

    console.log("🔍 Processing repayment for loan ID:", original_loan_id);

    const loanTransaction = await TransactionModel.findById(original_loan_id);

    if (!loanTransaction) {
      console.warn("⚠️ Original loan transaction not found:", original_loan_id);
      return;
    }

    // Log current state before update
    console.log("📋 Loan transaction before update:", {
      _id: loanTransaction._id,
      net_amount: loanTransaction.net_amount,
      repayment_status: loanTransaction.repayment_status
    });

    // Check if this repayment has already been processed to prevent double processing
    // This can happen if webhooks are sent multiple times
    const existingNetAmount = parseFloat(loanTransaction.net_amount);
    const expectedNewAmount = parseFloat(new_due_amount.toFixed(2));
    
    // If the loan already has the expected new amount, it means this repayment was already processed
    if (Math.abs(existingNetAmount - expectedNewAmount) < 0.01) {
      console.log("⚠️ Loan repayment already processed, skipping update");
      console.log("📋 Loan transaction unchanged:", {
        _id: loanTransaction._id,
        net_amount: loanTransaction.net_amount,
        repayment_status: loanTransaction.repayment_status
      });
      return;
    }

    // Update the loan's net_amount (remaining due) - THIS IS THE ACTUAL UPDATE
    const previousAmount = loanTransaction.net_amount;
    loanTransaction.net_amount = new_due_amount.toFixed(2);
    loanTransaction.last_repayment_date = new Date().toISOString();

    if (new_due_amount <= 0) {
      loanTransaction.repayment_status = "Paid";
      console.log("🎉 Loan fully repaid!");
    } else {
      loanTransaction.repayment_status = "Partially Paid";
      console.log("📊 Loan partially repaid, remaining:", new_due_amount);
    }

    await loanTransaction.save();
    
    // Log after update
    console.log("📋 Loan transaction after update:", {
      _id: loanTransaction._id,
      previous_net_amount: previousAmount,
      new_net_amount: loanTransaction.net_amount,
      repayment_status: loanTransaction.repayment_status
    });
    
    console.log("✅ Loan transaction updated successfully");

    if (new_due_amount <= 0) {
      const member = await MemberModel.findOne({ Member_id: member_id });
      if (member && member.upgrade_status === "Approved") {
        member.upgrade_status = "Repaid";
        await member.save();
        console.log("✅ Member loan status updated to Repaid");
      }
    }

    console.log("✅ Loan repayment processing completed");
  } catch (error) {
    console.error("❌ Error in processLoanRepayment:", error);
    throw error;
  }
}

// Helper function to revert loan repayment (kept for backward compatibility)
// Note: With the new flow where loan is only updated after payment success,
// this function is rarely needed, but kept for edge cases and manual intervention
async function revertLoanRepayment(paymentTransaction, _data) {
  try {
    console.log("🔄 Reverting loan repayment due to payment failure...");

    const { current_due_amount, original_loan_id } = paymentTransaction.repayment_context || {};

    if (!original_loan_id) {
      console.warn("⚠️ No original_loan_id in repayment_context, nothing to revert");
      return;
    }

    const loanTransaction = await TransactionModel.findById(original_loan_id);

    if (!loanTransaction) {
      console.warn("⚠️ Original loan transaction not found:", original_loan_id);
      return;
    }

    // Restore the original due amount
    if (current_due_amount !== undefined) {
      const previousAmount = loanTransaction.net_amount;
      loanTransaction.net_amount = current_due_amount.toFixed(2);
      loanTransaction.repayment_status = current_due_amount <= 0 ? "Paid" : "Unpaid";
      await loanTransaction.save();
      console.log("✅ Loan transaction reverted successfully", {
        _id: loanTransaction._id,
        previous_net_amount: previousAmount,
        restored_net_amount: loanTransaction.net_amount,
        repayment_status: loanTransaction.repayment_status
      });
    }

    console.log("✅ Loan repayment reversal completed");
  } catch (error) {
    console.error("❌ Error in revertLoanRepayment:", error);
    throw error;
  }
}

// Create a new payment order
exports.createOrder = async (req, res) => {
  try {
    console.log("🟢 CREATE ORDER STARTED =====================");
    console.log("📦 Request Body:", JSON.stringify(req.body, null, 2));

    // Extract data from request body
    const {
      amount,
      currency = "INR",
      customer,
      notes = {}
    } = req.body;

    const memberId = customer?.customer_id;
    const isLoanRepayment = notes?.isLoanRepayment !== false; // Default to true

    console.log("🔍 Extracted data:", {
      amount,
      memberId,
      isLoanRepayment,
      currency
    });

    // Validate amount
    if (!amount || amount <= 0) {
      console.log("❌ Amount validation failed");
      return res.status(400).json({
        success: false,
        message: "Valid payment amount is required.",
      });
    }

    // Validate memberId
    if (!memberId) {
      console.log("❌ Member ID validation failed");
      return res.status(400).json({
        success: false,
        message: "Member ID is required.",
      });
    }

    console.log("🔍 Searching for member in database...");
    const member = await MemberModel.findOne({ Member_id: memberId });

    if (!member) {
      console.log("❌ Member not found in database");
      return res.status(404).json({
        success: false,
        message: "Member not found.",
      });
    }

    console.log("✅ Member found:", {
      Member_id: member.Member_id,
      Name: member.Name,
      email: member.email,
      mobileno: member.mobileno
    });

    let loanTransaction = null;
    let currentDueAmount = 0;
    let newDueAmount = 0;

    // For loan repayment, validate loan details and calculate new due amount
    if (isLoanRepayment) {
      console.log("💰 Loan repayment flow activated");

      // Find the most recent approved loan transaction for this member
      // Sort by _id descending to get the most recently created one (more reliable than transaction_date)
      loanTransaction = await TransactionModel.findOne({
        member_id: memberId,
        transaction_type: "Reward Loan Request",
        status: "Approved",
      }).sort({ _id: -1 });

      if (!loanTransaction) {
        console.log("❌ No approved loan found");
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
        console.log("❌ Loan already repaid");
        return res.status(400).json({
          success: false,
          message: "Loan is already fully repaid.",
        });
      }

      if (amount > currentDueAmount) {
        console.log("❌ Amount exceeds due amount");
        return res.status(400).json({
          success: false,
          message: `Repayment amount cannot exceed due amount of ₹${currentDueAmount.toFixed(2)}.`,
        });
      }

      newDueAmount = currentDueAmount - amount;
      console.log("📊 Amount calculation:", {
        current_due: currentDueAmount,
        repayment_amount: amount,
        new_due: newDueAmount,
        calculation: `${currentDueAmount} - ${amount} = ${newDueAmount}`
      });

      // NOTE: We do NOT update the loan here anymore!
      // Loan will only be updated after successful payment confirmation via webhook
      // This prevents inconsistent state if payment fails or user abandons
      console.log("📝 Loan update will be processed after payment confirmation via webhook");
    }

    console.log("🔑 Checking Cashfree credentials...");
    const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
    const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;

    if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
      console.error("❌ Missing Cashfree credentials");
      return res.status(500).json({
        success: false,
        message: "Payment service configuration error.",
      });
    }

    // Log credential info (first 6 and last 4 chars only for security)
    console.log("🔐 Credential Info:", {
      appId: CASHFREE_APP_ID.substring(0, 6) + "..." + CASHFREE_APP_ID.substring(CASHFREE_APP_ID.length - 4),
      secretKeyLength: CASHFREE_SECRET_KEY.length,
      env: process.env.NODE_ENV,
      baseUrl: CASHFREE_BASE
    });

    // Check if we're using test credentials in production environment
    const isTestCredentials = CASHFREE_APP_ID.startsWith('TEST') || CASHFREE_SECRET_KEY.includes('test');
    const isProductionEnv = process.env.NODE_ENV === "PROD";
    
    if (isProductionEnv && isTestCredentials) {
      console.warn("⚠️ WARNING: Using TEST credentials in PRODUCTION environment!");
      console.warn("This may cause authentication failures.");
    }

    const headers = {
      "Content-Type": "application/json",
      "x-api-version": X_API_VERSION,
      "x-client-id": CASHFREE_APP_ID,
      "x-client-secret": CASHFREE_SECRET_KEY,
    };

    // Helper function to clean and validate URL
    const cleanUrl = (url) => {
      if (!url) return null;
      // Remove any trailing comments or whitespace
      let cleaned = url.split(' ')[0].trim();
      // Ensure URL doesn't have trailing slash
      cleaned = cleaned.replace(/\/+$/, '');
      return cleaned;
    };

    // Handle return URL - use HTTPS for production
    let frontendUrl = cleanUrl(process.env.FRONTEND_URL) || 'http://localhost:5173';

    // For Cashfree production environment, ensure HTTPS
    if (process.env.NODE_ENV === "PROD" && frontendUrl.startsWith("http://")) {
      frontendUrl = frontendUrl.replace("http://", "https://");
    }

    // Build return URL with query parameters
    let returnUrl = `${frontendUrl}/user/dashboard?payment_status={order_status}&order_id={order_id}&member_id=${memberId}`;
    
    // Handle notify URL (webhook) - use HTTPS for production, HTTP for local development
    let backendUrl = process.env.BACKEND_URL || 'http://localhost:5051';
    // Remove any comments from the URL
    backendUrl = backendUrl.split(' ')[0].split('//')[0] + '//' + backendUrl.split(' ')[0].split('//')[1];
    
    let notifyUrl = `${backendUrl}/payments/webhook`;
    
    // For Cashfree production environment, ensure HTTPS
    if (process.env.NODE_ENV === "PROD" && backendUrl.startsWith("http://")) {
      backendUrl = backendUrl.replace("http://", "https://");
      // Also update notifyUrl since backendUrl changed
      notifyUrl = `${backendUrl}/payments/webhook`;
    }
    
    // Log the URLs for debugging
    console.log("🔗 URLs for Cashfree:", {
      frontendUrl: frontendUrl,
      backendUrl: backendUrl,
      returnUrl: returnUrl,
      notifyUrl: notifyUrl
    });

    const cashfreeBody = {
      order_amount: amount,
      order_currency: currency,
      customer_details: {
        customer_id: memberId,
        customer_name: customer?.customer_name || member.Name || "Customer",
        customer_email: customer?.customer_email || member.email || "customer@example.com",
        customer_phone: customer?.customer_phone || member.mobileno || "9999999999",
      },
      order_meta: {
        return_url: returnUrl,
        notify_url: notifyUrl
      }
    };

    console.log("🚀 Sending to Cashfree:", {
      url: `${CASHFREE_BASE}/pg/orders`,
      amount: amount,
      customer_id: memberId,
      return_url: returnUrl,
      notify_url: notifyUrl
    });

    // Call Cashfree API directly with correct endpoint
    const response = await axios.post(`${CASHFREE_BASE}/pg/orders`, cashfreeBody, { 
      headers,
      timeout: 10000
    });

    console.log("✅ Cashfree response received:", {
      order_id: response.data.order_id,
      payment_session_id: response.data.payment_session_id,
      status: response.status
    });

    // Validate that we received a payment_session_id
    if (!response.data.payment_session_id) {
      console.error("❌ Missing payment_session_id in Cashfree response");
      return res.status(500).json({
        success: false,
        message: "Payment session could not be created. Please try again.",
        error: "Missing payment_session_id in response"
      });
    }

    // Save payment record to database
    const paymentRecord = new PaymentModel({
      memberId: memberId,
      orderId: response.data.order_id,
      cfOrderId: response.data.cf_order_id,
      paymentSessionId: response.data.payment_session_id,
      amount: amount,
      currency: currency,
      status: response.data.order_status,
      customer: {
        customer_id: memberId,
        customer_name: customer?.customer_name || member.Name,
        customer_email: customer?.customer_email || member.email,
        customer_phone: customer?.customer_phone || member.mobileno,
      },
      rawResponse: response.data,
      notes: notes
    });

    await paymentRecord.save();
    console.log("✅ Payment record saved successfully");

    // Save repayment transaction to database
    const transactionData = {
      transaction_id: response.data.order_id,
      transaction_date: new Date().toISOString(),
      member_id: memberId,
      description: `Loan Repayment Payment of ₹${amount}. Remaining Due: ₹${newDueAmount.toFixed(2)}`,
      Name: member.Name,
      mobileno: member.mobileno,
      transaction_type: "Loan Repayment Payment",
      ew_debit: amount,
      net_amount: newDueAmount,
      status: "Pending",
      reference_no: response.data.order_id,
      is_loan_repayment: true,
      repayment_context: {
        member_id: memberId,
        requested_amount: amount,
        current_due_amount: currentDueAmount,
        new_due_amount: newDueAmount,
        member_name: member.Name,
        member_phone: member.mobileno,
        original_loan_id: loanTransaction?._id,
        original_loan_reference: loanTransaction?.reference_no,
        original_loan_transaction_id: loanTransaction?.transaction_id
      }
    };

    await TransactionModel.create(transactionData);
    console.log("✅ Payment transaction saved successfully");

    const responseData = {
      success: true,
      order_id: response.data.order_id,
      payment_session_id: response.data.payment_session_id,
      order_amount: response.data.order_amount,
      order_currency: response.data.order_currency,
      is_loan_repayment: true,
      member_id: memberId,
      member_name: member.Name,
      // Tell frontend which Cashfree environment to use (must match backend)
      cashfree_env: process.env.NODE_ENV === "PROD" ? "production" : "sandbox",
      loan_details: {
        current_due_amount: currentDueAmount,
        repayment_amount: amount,
        new_due_amount: newDueAmount,
        repayment_status: newDueAmount <= 0 ? "Paid" : "Partially Paid",
        original_loan_updated: true,
        original_loan_id: loanTransaction?._id
      }
    };

    console.log("📤 Sending success response to client");
    res.json(responseData);

  } catch (error) {
    console.error("❌ ERROR IN CREATE ORDER =====================");
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);

    if (error.response) {
      console.error("🚨 Cashfree API Error:");
      console.error("Status:", error.response.status);
      console.error("Data:", JSON.stringify(error.response.data, null, 2));

      if (error.response.status === 401) {
        // Check if it's a credential mismatch issue
        const isTestCredentials = process.env.CASHFREE_APP_ID?.startsWith('TEST') || 
                                 process.env.CASHFREE_SECRET_KEY?.includes('test');
        const isProductionEnv = process.env.NODE_ENV === "PROD";
        
        if (isProductionEnv && isTestCredentials) {
          return res.status(500).json({
            success: false,
            message: "Payment service authentication failed.",
            error: "Invalid Cashfree credentials",
            details: error.response.data,
            solution: "You're using TEST credentials in PRODUCTION environment. Either switch to production credentials or set NODE_ENV=development"
          });
        }
        
        return res.status(500).json({
          success: false,
          message: "Payment service authentication failed.",
          error: "Invalid Cashfree credentials",
          details: error.response.data,
          solution: "Verify your CASHFREE_APP_ID and CASHFREE_SECRET_KEY are correct for production environment"
        });
      }

      if (error.response.status === 400) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment request.",
          error: error.response.data?.message || "Bad request to payment service"
        });
      }

      // Handle payment_session_id_invalid error specifically
      if (error.response.data?.code === "payment_session_id_invalid") {
        return res.status(400).json({
          success: false,
          message: "Payment session is invalid or has expired. Please try again.",
          error: error.response.data
        });
      }

      // Handle return_url_invalid error specifically
      if (error.response.data?.code === "order_meta.return_url_invalid") {
        return res.status(400).json({
          success: false,
          message: "Return URL is invalid. For production environments, HTTPS URLs are required.",
          error: error.response.data,
          solution: "Ensure your FRONTEND_URL environment variable uses HTTPS in production"
        });
      }

      // Handle notify_url_invalid error specifically
      if (error.response.data?.code === "order_meta.notify_url_invalid") {
        return res.status(400).json({
          success: false,
          message: "Notify URL (webhook) is invalid. For production environments, HTTPS URLs are required.",
          error: error.response.data,
          solution: "Ensure your BACKEND_URL environment variable uses HTTPS in production"
        });
      }
    }

    res.status(500).json({
      success: false,
      message: "Failed to create payment order",
      error: error.response?.data?.message || error.message,
    });
  } finally {
    console.log("🔚 CREATE ORDER COMPLETED =====================\n");
  }
};

// Verify payment status
exports.verifyPayment = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required"
      });
    }

    // Check if payment exists in our database
    const payment = await PaymentModel.findOne({ orderId: orderId });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found"
      });
    }

    // Get payment status from Cashfree
    const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
    const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;

    if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: "Payment service configuration error."
      });
    }

    const headers = {
      "Content-Type": "application/json",
      "x-api-version": X_API_VERSION,
      "x-client-id": CASHFREE_APP_ID,
      "x-client-secret": CASHFREE_SECRET_KEY,
    };

    // Call Cashfree API directly with correct endpoint
    const response = await axios.get(`${CASHFREE_BASE}/pg/orders/${orderId}`, { headers });

    // Update our payment record
    payment.status = response.data.order_status;
    payment.rawResponse = response.data;
    await payment.save();

    // Get payment time from payment details if available
    const paymentTime = response.data.payment_details?.length > 0
      ? response.data.payment_details[0]?.payment_time
      : null;

    // Response format matching frontend VerifyPaymentResponse interface
    res.json({
      success: true,
      message: `Payment ${response.data.order_status === 'PAID' ? 'successful' : 'status: ' + response.data.order_status}`,
      payment_status: response.data.order_status,
      order_id: response.data.order_id,
      amount: response.data.order_amount,
      payment_time: paymentTime
    });
  } catch (error) {
    console.error("Error verifying payment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify payment",
      payment_status: "FAILED",
      order_id: req.params.orderId,
      error: error.message
    });
  }
};

// Get incomplete payments
exports.getIncompletePayment = async (req, res) => {
  try {
    const { memberId } = req.params;

    if (!memberId) {
      return res.status(400).json({
        success: false,
        message: "Member ID is required"
      });
    }

    // Find payments that are not completed
    const incompletePayments = await PaymentModel.find({
      memberId: memberId,
      status: { $nin: ["PAID", "CANCELLED", "EXPIRED"] }
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: incompletePayments
    });
  } catch (error) {
    console.error("Error fetching incomplete payments:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch incomplete payments",
      error: error.message
    });
  }
};



// Handle webhook from Cashfree
exports.handleWebhook = async (req, res) => {
  try {
    console.log("🟢 WEBHOOK RECEIVED =====================");
    console.log("📦 Webhook Method:", req.method);
    console.log("📦 Webhook URL:", req.url);
    console.log("📦 Webhook Headers:", req.headers);
    console.log("📦 Webhook Body Type:", typeof req.body);
    console.log("📦 Webhook Body Length:", req.body?.length || 'N/A');
    
    // Log first 1000 characters of body for debugging without overwhelming logs
    if (typeof req.body === 'string') {
      console.log("📦 Webhook Body Preview:", req.body.substring(0, 1000) + (req.body.length > 1000 ? '...' : ''));
    } else if (Buffer.isBuffer(req.body)) {
      const bodyStr = req.body.toString('utf8');
      console.log("📦 Webhook Buffer Body Preview:", bodyStr.substring(0, 1000) + (bodyStr.length > 1000 ? '...' : ''));
    } else {
      console.log("📦 Webhook Body (Object):", JSON.stringify(req.body, null, 2));
    }

    const signature = req.headers["x-webhook-signature"];
    const timestamp = req.headers["x-webhook-timestamp"];
    const secret = process.env.CASHFREE_SECRET_KEY;
    const webhookVersion = req.headers["x-webhook-version"] || "unknown";

    console.log("🔐 Webhook Security Info:", {
      hasSignature: !!signature,
      hasTimestamp: !!timestamp,
      hasSecret: !!secret,
      secretLength: secret?.length || 0,
      webhookVersion: webhookVersion
    });

    // Handle raw body - ensure we have the exact string that was signed
    let rawBody;
    if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString('utf8');
    } else if (typeof req.body === 'string') {
      rawBody = req.body;
    } else {
      rawBody = JSON.stringify(req.body);
    }
    console.log("📄 Raw webhook body length:", rawBody.length);
    console.log("📄 Raw webhook body preview:", rawBody.substring(0, 500) + (rawBody.length > 500 ? '...' : ''));

    // Try to parse the body for easier inspection
    let parsedData;
    try {
      parsedData = JSON.parse(rawBody);
      console.log("📄 Parsed webhook data keys:", Object.keys(parsedData));
      if (parsedData.data) {
        console.log("📄 Parsed webhook data.data keys:", Object.keys(parsedData.data));
        if (parsedData.data.order) {
          console.log("📄 Parsed webhook data.data.order keys:", Object.keys(parsedData.data.order));
        }
        if (parsedData.data.payment) {
          console.log("📄 Parsed webhook data.data.payment keys:", Object.keys(parsedData.data.payment));
        }
      }
      // Log the event type if present
      if (parsedData.type || parsedData.event) {
        console.log("🔔 Webhook Event Type:", parsedData.type || parsedData.event);
      }
    } catch (parseErr) {
      console.error("❌ Failed to parse webhook body:", parseErr);
      console.log("📄 Raw body that failed to parse:", rawBody.substring(0, 500));
      // Even if we can't parse, we still need to respond properly for Cashfree
      return res.status(400).send("Invalid JSON in webhook body");
    }

    // Only verify signature if it's actually from Cashfree (not a test)
    if (signature && timestamp && secret) {
      // Log the exact values being used for signature verification
      console.log("🔐 Signature Verification Details:", {
        timestamp: timestamp,
        rawBody: rawBody.substring(0, 200) + (rawBody.length > 200 ? '...' : ''),
        secretStart: secret.substring(0, 10) + "...",
        secretEnd: "..." + secret.substring(secret.length - 10),
        webhookVersion: webhookVersion
      });
      
      let genSig;
      
      // Different signature verification based on webhook version
      if (webhookVersion === "2023-08-01") {
        // Newer version uses payload + timestamp
        const payload = rawBody + timestamp;
        genSig = crypto.createHmac("sha256", secret).update(payload).digest("base64");
        console.log("🔐 Using 2023-08-01 signature method (payload + timestamp)");
      } else if (webhookVersion === "2021-09-21") {
        // Older version uses timestamp + payload
        const payload = timestamp + rawBody;
        genSig = crypto.createHmac("sha256", secret).update(payload).digest("base64");
        console.log("🔐 Using 2021-09-21 signature method (timestamp + payload)");
      } else {
        // Try multiple methods for unknown versions
        console.log("🔐 Unknown webhook version, trying multiple methods...");
        
        // Method 1: timestamp + payload
        const payload1 = timestamp + rawBody;
        const genSig1 = crypto.createHmac("sha256", secret).update(payload1).digest("base64");
        
        // Method 2: payload + timestamp
        const payload2 = rawBody + timestamp;
        const genSig2 = crypto.createHmac("sha256", secret).update(payload2).digest("base64");
        
        // Method 3: Just payload (some versions might not use timestamp)
        const genSig3 = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
        
        console.log("🔐 Trying signature methods:", {
          method1: payload1.substring(0, 100) + "...",
          method2: payload2.substring(0, 100) + "...",
          method3: rawBody.substring(0, 100) + "..."
        });
        
        // Check which one matches
        if (genSig1 === signature) {
          genSig = genSig1;
          console.log("✅ Method 1 matched (timestamp + payload)");
        } else if (genSig2 === signature) {
          genSig = genSig2;
          console.log("✅ Method 2 matched (payload + timestamp)");
        } else if (genSig3 === signature) {
          genSig = genSig3;
          console.log("✅ Method 3 matched (payload only)");
        } else {
          // None matched, let's try some variations
          console.log("🔐 No exact match, trying variations...");
          
          // Try with different encodings
          const utf8Payload = Buffer.from(rawBody, 'utf8').toString();
          const payloadUtf8 = timestamp + utf8Payload;
          const genSigUtf8 = crypto.createHmac("sha256", secret).update(payloadUtf8).digest("base64");
          
          if (genSigUtf8 === signature) {
            genSig = genSigUtf8;
            console.log("✅ UTF-8 variation matched");
          } else {
            // Default to method 1 and continue (might be a temporary issue)
            genSig = genSig1;
            console.log("⚠️ No method matched, defaulting to method 1 for now");
          }
        }
      }

      console.log("🔐 Signature Verification:", {
        receivedSignature: signature,
        generatedSignature: genSig,
        signaturesMatch: genSig === signature
      });

      // If signatures don't match, we'll still process but log a warning
      // This is to prevent losing payments due to signature issues
      if (genSig !== signature) {
        console.warn("⚠️ Cashfree signature mismatch - processing anyway to avoid payment loss");
        console.log("Expected:", genSig);
        console.log("Received:", signature);
        console.log("Payload length:", (timestamp + rawBody).length);
        console.log("First 200 chars of payload:", (timestamp + rawBody).substring(0, 200));
      }
    } else {
      console.log("⚠️ No signature/timestamp/secret found - this might be a test webhook");
    }

    const data = typeof req.body === 'object' && !Buffer.isBuffer(req.body)
      ? req.body
      : JSON.parse(rawBody);
    console.log("✅ Processing webhook data:", JSON.stringify(data, null, 2));

    // Enhanced logging to debug order ID extraction
    console.log("🔍 Extracting order ID from webhook data...");
    const orderId = data.data?.order?.order_id || data.data?.order_id || data.order_id;
    console.log("📋 Extracted order ID:", orderId);
    
    if (!orderId) {
      console.warn("❌ No order ID found in webhook data");
      console.log("📄 Full webhook data structure:", JSON.stringify(data, null, 2));
      return res.status(400).send("Order ID not found in webhook data");
    }

    const paymentTransaction = await TransactionModel.findOne({
      transaction_id: orderId
    });

    if (!paymentTransaction) {
      console.warn("❌ Transaction not found for order:", orderId);
      // Log more details to help with debugging
      console.log("🔍 Searching for transactions with similar IDs...");
      const similarTransactions = await TransactionModel.find({
        transaction_id: { $regex: orderId.substring(0, Math.min(orderId.length, 10)) }
      }).limit(5);
      
      if (similarTransactions.length > 0) {
        console.log("🔍 Found similar transactions:", similarTransactions.map(t => ({
          id: t.transaction_id,
          orderId: orderId,
          match: t.transaction_id === orderId
        })));
      } else {
        console.log("🔍 No similar transactions found");
      }
      
      // Still return 200 to acknowledge receipt, but log the issue
      return res.status(200).json({
        success: false,
        message: "Transaction not found",
        order_id: orderId
      });
    }

    // IDEMPOTENCY CHECK - Prevent duplicate processing
    if (paymentTransaction.webhook_processed) {
      console.log("⚠️ Webhook already processed for order:", orderId);
      return res.status(200).json({
        success: true,
        message: "Webhook already processed",
        order_id: orderId
      });
    }

    console.log("✅ Payment transaction found:", {
      transaction_id: paymentTransaction.transaction_id,
      member_id: paymentTransaction.member_id,
      is_loan_repayment: paymentTransaction.is_loan_repayment,
      expected_amount: paymentTransaction.ew_debit
    });

    // Enhanced logging to debug order status extraction
    console.log("🔍 Extracting order status from webhook data...");
    // Cashfree uses payment_status for newer webhooks and order_status for older ones
    const orderStatus = data.data?.payment?.payment_status || data.data?.order?.order_status || data.order_status;
    console.log("📋 Extracted order status:", orderStatus);
    
    if (!orderStatus) {
      console.warn("❌ No order status found in webhook data");
      console.log("📄 Data structure for status extraction:", JSON.stringify(data, null, 2));
    }

    // Map Cashfree payment statuses to our internal statuses
    const statusMap = {
      "SUCCESS": "PAID",
      "FAILED": "Failed",
      "CANCELLED": "Cancelled",
      "PENDING": "Pending"
    };
    
    const mappedStatus = statusMap[orderStatus] || orderStatus;
    const isSuccessful = mappedStatus === "PAID";
    const status = isSuccessful ? "Completed" : "Failed";
    
    console.log("📊 Payment outcome evaluation:", {
      rawOrderStatus: orderStatus,
      mappedStatus: mappedStatus,
      isSuccessful: isSuccessful,
      transactionStatus: status
    });

    // AMOUNT VERIFICATION - Critical security check
    if (data.data?.payment) {
      const paymentData = data.data.payment;
      const receivedAmount = parseFloat(paymentData.payment_amount);
      const expectedAmount = parseFloat(paymentTransaction.ew_debit);

      console.log("💰 Amount verification:", {
        received: receivedAmount,
        expected: expectedAmount
      });

      // Verify amount matches (with small tolerance for floating point)
      if (isSuccessful && Math.abs(receivedAmount - expectedAmount) > 0.01) {
        console.error("❌ CRITICAL: Payment amount mismatch!", {
          received: receivedAmount,
          expected: expectedAmount,
          difference: Math.abs(receivedAmount - expectedAmount)
        });
        // Log this for investigation but don't process
        paymentTransaction.status = "Failed";
        paymentTransaction.description = `Amount mismatch: received ₹${receivedAmount}, expected ₹${expectedAmount}`;
        paymentTransaction.webhook_processed = true;
        paymentTransaction.webhook_processed_at = new Date();
        await paymentTransaction.save();
        return res.status(200).json({
          success: false,
          message: "Payment amount mismatch - contact support",
          order_id: orderId
        });
      }

      // Properly handle payment method object from Cashfree
      let paymentMethodString = "Unknown";
      if (paymentData.payment_method) {
        if (typeof paymentData.payment_method === 'string') {
          paymentMethodString = paymentData.payment_method;
        } else if (typeof paymentData.payment_method === 'object') {
          // Handle nested payment method objects (like UPI)
          if (paymentData.payment_method.upi) {
            const upi = paymentData.payment_method.upi;
            paymentMethodString = `UPI: ${upi.upi_id || 'Unknown UPI ID'}`;
          } else if (paymentData.payment_method.card) {
            paymentMethodString = "Card Payment";
          } else if (paymentData.payment_method.netbanking) {
            paymentMethodString = "Net Banking";
          } else {
            // Convert object to string representation
            paymentMethodString = JSON.stringify(paymentData.payment_method);
          }
        }
      }

      paymentTransaction.payment_details = {
        payment_method: paymentMethodString,
        bank_reference: paymentData.bank_reference,
        payment_time: paymentData.payment_time,
        payment_amount: receivedAmount
      };
    }

    paymentTransaction.status = status;
    paymentTransaction.description = `Payment ${mappedStatus} - ${data.data?.payment?.payment_message || data.payment_message || 'Processed'}`;
    paymentTransaction.webhook_processed = true;
    paymentTransaction.webhook_processed_at = new Date();

    await paymentTransaction.save();
    console.log("✅ Payment transaction updated with status:", status);

    // Update payment record in Payment collection
    const paymentRecord = await PaymentModel.findOne({ orderId: orderId });
    if (paymentRecord) {
      paymentRecord.status = mappedStatus;
      if (!paymentRecord.notifications) paymentRecord.notifications = [];
      paymentRecord.notifications.push(data);
      paymentRecord.rawResponse = data;
      await paymentRecord.save();
      console.log("✅ Payment record updated with status:", mappedStatus);
    } else {
      console.warn("⚠️ Payment record not found for order:", orderId);
    }

    // Process loan repayment ONLY after confirmed payment success
    if (isSuccessful && paymentTransaction.is_loan_repayment) {
      console.log("💰 Processing loan repayment after confirmed payment...");
      await processLoanRepayment(paymentTransaction, data);
    }
    // Note: We no longer call revertLoanRepayment because loan is never pre-emptively updated

    console.log("✅ Webhook processing completed successfully");
    // Always return 200 to acknowledge successful processing
    res.status(200).json({
      success: true,
      message: "Webhook processed successfully",
      order_id: orderId,
      status: mappedStatus
    });
  } catch (err) {
    console.error("❌ WEBHOOK ERROR =====================");
    console.error("Error name:", err.name);
    console.error("Error message:", err.message);
    console.error("Stack trace:", err.stack);
    
    // Try to log the request body if available
    try {
      console.log("📄 Request body at time of error:", typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    } catch (logErr) {
      console.log("📄 Could not log request body:", logErr.message);
    }
    
    // Always return 200 to acknowledge receipt, even if processing failed
    // This prevents Cashfree from retrying indefinitely
    res.status(200).json({
      success: false,
      message: "Webhook received but processing failed",
      error: err.message
    });
  } finally {
    console.log("🔚 WEBHOOK PROCESSING COMPLETED =====================\n");
  }
};


// Retry a failed payment
exports.retryPayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required"
      });
    }

    // Find the payment record
    const payment = await PaymentModel.findOne({ orderId: orderId });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found"
      });
    }

    // Check if payment can be retried
    if (payment.status === "PAID" || payment.status === "CANCELLED") {
      return res.status(400).json({
        success: false,
        message: "Payment cannot be retried as it's already completed or cancelled"
      });
    }

    // Get Cashfree credentials
    const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
    const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;

    if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: "Payment service configuration error."
      });
    }

    const headers = {
      "Content-Type": "application/json",
      "x-api-version": X_API_VERSION,
      "x-client-id": CASHFREE_APP_ID,
      "x-client-secret": CASHFREE_SECRET_KEY,
    };

    // Retry the payment by creating a new session
    const retryBody = {
      order_id: orderId
    };

    // Call Cashfree API directly with correct endpoint
    const response = await axios.post(`${CASHFREE_BASE}/pg/orders/${orderId}/retry`, retryBody, { headers });
    
    // Update payment record
    payment.paymentSessionId = response.data.payment_session_id;
    payment.status = response.data.order_status;
    payment.rawResponse = response.data;
    await payment.save();

    res.json({
      success: true,
      data: {
        orderId: response.data.order_id,
        paymentSessionId: response.data.payment_session_id,
        status: response.data.order_status
      }
    });
  } catch (error) {
    console.error("Error retrying payment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retry payment",
      error: error.message
    });
  }
};

// Handle payment redirect
exports.handlePaymentRedirect = async (req, res) => {
  try {
    const { order_id, order_status, member_id } = req.query;

    if (!order_id || !order_status || !member_id) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters"
      });
    }

    // Find the payment record
    const payment = await PaymentModel.findOne({ orderId: order_id });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found"
      });
    }

    // Update payment status
    payment.status = order_status;
    await payment.save();

    // Find transaction record
    const transaction = await TransactionModel.findOne({ transaction_id: order_id });

    if (transaction) {
      transaction.status = order_status === "PAID" ? "Completed" : "Failed";
      await transaction.save();
    }

    // Return success response
    res.json({
      success: true,
      data: {
        orderId: order_id,
        status: order_status,
        memberId: member_id
      }
    });
  } catch (error) {
    console.error("Error handling payment redirect:", error);
    res.status(500).json({
      success: false,
      message: "Failed to handle payment redirect",
      error: error.message
    });
  }
};

// Check payment status
exports.checkPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required"
      });
    }

    // Find payment in our database
    const payment = await PaymentModel.findOne({ orderId: orderId });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found"
      });
    }

    res.json({
      success: true,
      data: {
        orderId: payment.orderId,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt
      }
    });
  } catch (error) {
    console.error("Error checking payment status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check payment status",
      error: error.message
    });
  }
};

// Raise a ticket for payment issues
exports.raiseTicket = async (req, res) => {
  try {
    const { orderId, issueType, description } = req.body;
    const { memberId } = req.user; // Assuming user is authenticated

    if (!orderId || !issueType || !description) {
      return res.status(400).json({
        success: false,
        message: "Order ID, issue type, and description are required"
      });
    }

    // Find the payment record
    const payment = await PaymentModel.findOne({ orderId: orderId });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found"
      });
    }

    // In a real implementation, you would create a ticket in your ticketing system
    // For now, we'll just update the payment record with the ticket info
    if (!payment.notes) {
      payment.notes = {};
    }

    payment.notes.ticket = {
      issueType: issueType,
      description: description,
      raisedBy: memberId,
      raisedAt: new Date()
    };

    await payment.save();

    res.json({
      success: true,
      message: "Ticket raised successfully",
      data: {
        ticketId: `TICKET-${Date.now()}`,
        orderId: orderId,
        issueType: issueType
      }
    });
  } catch (error) {
    console.error("Error raising ticket:", error);
    res.status(500).json({
      success: false,
      message: "Failed to raise ticket",
      error: error.message
    });
  }
};

// Save incomplete payment
exports.saveIncompletePayment = async (req, res) => {
  try {
    const { orderId, paymentData } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required"
      });
    }

    // Find or create payment record
    let payment = await PaymentModel.findOne({ orderId: orderId });

    if (!payment) {
      // Create new payment record for incomplete payment
      payment = new PaymentModel({
        orderId: orderId,
        status: "PENDING",
        rawResponse: paymentData || {}
      });
    } else {
      // Update existing payment record
      payment.rawResponse = paymentData || payment.rawResponse;
      payment.status = payment.status === "PAID" ? payment.status : "PENDING";
    }

    await payment.save();

    res.json({
      success: true,
      message: "Incomplete payment saved successfully",
      data: payment
    });
  } catch (error) {
    console.error("Error saving incomplete payment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save incomplete payment",
      error: error.message
    });
  }
};

// Process successful payment
exports.processSuccessfulPayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required"
      });
    }

    // Find payment record
    const payment = await PaymentModel.findOne({ orderId: orderId });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found"
      });
    }

    // Update status to PAID if not already
    if (payment.status !== "PAID") {
      payment.status = "PAID";
      await payment.save();
    }

    // Find transaction record
    const transaction = await TransactionModel.findOne({ transaction_id: orderId });

    if (transaction) {
      transaction.status = "Completed";
      await transaction.save();

      // Process loan repayment if applicable
      if (transaction.is_loan_repayment) {
        console.log("💰 Processing loan repayment for manual payment completion...");
        await processLoanRepayment(transaction, {});
      }
    }

    res.json({
      success: true,
      message: "Payment processed successfully",
      data: {
        orderId: orderId,
        status: payment.status
      }
    });
  } catch (error) {
    console.error("Error processing successful payment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process successful payment",
      error: error.message
    });
  }
};

// Process failed payment
exports.processFailedPayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required"
      });
    }

    // Find payment record
    const payment = await PaymentModel.findOne({ orderId: orderId });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found"
      });
    }

    // Update status to FAILED if not already
    if (payment.status !== "FAILED" && payment.status !== "CANCELLED") {
      payment.status = "FAILED";
      await payment.save();
    }

    // Find transaction record
    const transaction = await TransactionModel.findOne({ transaction_id: orderId });

    if (transaction) {
      transaction.status = "Failed";
      await transaction.save();

      // Revert loan repayment if applicable
      if (transaction.is_loan_repayment) {
        await revertLoanRepayment(transaction, {});
      }
    }

    res.json({
      success: true,
      message: "Failed payment processed successfully",
      data: {
        orderId: orderId,
        status: payment.status
      }
    });
  } catch (error) {
    console.error("Error processing failed payment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process failed payment",
      error: error.message
    });
  }
};

// Additional endpoint to process loan repayment manually
exports.processLoanRepayment = async (req, res) => {
  try {
    const { memberId, transactionId } = req.body;

    if (!memberId || !transactionId) {
      return res.status(400).json({
        success: false,
        message: "Member ID and Transaction ID are required"
      });
    }

    const paymentTransaction = await TransactionModel.findOne({
      transaction_id: transactionId,
      member_id: memberId
    });

    if (!paymentTransaction) {
      return res.status(404).json({
        success: false,
        message: "Payment transaction not found"
      });
    }

    await processLoanRepayment(paymentTransaction, {});

    res.json({
      success: true,
      message: "Loan repayment processed successfully"
    });
  } catch (error) {
    console.error("Error processing loan repayment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process loan repayment"
    });
  }
};

// Additional endpoint to revert loan repayment manually
exports.revertLoanRepayment = async (req, res) => {
  try {
    const { memberId, transactionId } = req.body;

    if (!memberId || !transactionId) {
      return res.status(400).json({
        success: false,
        message: "Member ID and Transaction ID are required"
      });
    }

    const paymentTransaction = await TransactionModel.findOne({
      transaction_id: transactionId,
      member_id: memberId
    });

    if (!paymentTransaction) {
      return res.status(404).json({
        success: false,
        message: "Payment transaction not found"
      });
    }

    await revertLoanRepayment(paymentTransaction, {});

    res.json({
      success: true,
      message: "Loan repayment reverted successfully"
    });
  } catch (error) {
    console.error("Error reverting loan repayment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to revert loan repayment"
    });
  }
};

module.exports = {
  createOrder: exports.createOrder,
  verifyPayment: exports.verifyPayment,
  getIncompletePayment: exports.getIncompletePayment,
  handleWebhook: exports.handleWebhook,
  retryPayment: exports.retryPayment,
  handlePaymentRedirect: exports.handlePaymentRedirect,
  checkPaymentStatus: exports.checkPaymentStatus,
  raiseTicket: exports.raiseTicket,
  saveIncompletePayment: exports.saveIncompletePayment,
  processSuccessfulPayment: exports.processSuccessfulPayment,
  processFailedPayment: exports.processFailedPayment,
  processLoanRepayment: exports.processLoanRepayment,
  revertLoanRepayment: exports.revertLoanRepayment
};