const axios = require("axios");
const crypto = require("crypto");
const TransactionModel = require("../../models/Transaction/Transaction");
const MemberModel = require("../../models/Users/Member");
const PaymentModel = require("../../models/Payments/Payment");

const CASHFREE_BASE = process.env.NODE_ENV === "production"
  ? "https://api.cashfree.com/pg"
  : "https://sandbox.cashfree.com/pg";
const X_API_VERSION = "2025-01-01";

// Helper function to process loan repayment (called ONLY after payment success)
async function processLoanRepayment(paymentTransaction, data) {
  try {
    console.log("🔄 Starting loan repayment processing...");

    const {
      member_id,
      current_due_amount,
      new_due_amount,
      requested_amount,
      original_loan_id
    } = paymentTransaction.repayment_context;

    const loanTransaction = await TransactionModel.findById(original_loan_id);

    if (!loanTransaction) {
      console.warn("⚠️ Original loan transaction not found:", original_loan_id);
      return;
    }

    // Update the loan's net_amount (remaining due) - THIS IS THE ACTUAL UPDATE
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
      loanTransaction.net_amount = current_due_amount.toFixed(2);
      loanTransaction.repayment_status = current_due_amount <= 0 ? "Paid" : "Unpaid";
      await loanTransaction.save();
      console.log("✅ Loan transaction reverted successfully");
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

      loanTransaction = await TransactionModel.findOne({
        member_id: memberId,
        transaction_type: "Reward Loan Request",
        status: "Approved",
      }).sort({ transaction_date: -1 });

      if (!loanTransaction) {
        console.log("❌ No approved loan found");
        return res.status(404).json({
          success: false,
          message: "No approved reward loan found for this member to repay.",
        });
      }

      currentDueAmount = parseFloat(loanTransaction.net_amount) || parseFloat(loanTransaction.ew_credit) || 0;
      console.log("💳 Current due amount:", currentDueAmount);

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
        new_due: newDueAmount
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
    if (process.env.NODE_ENV === "production" && frontendUrl.startsWith("http://")) {
      frontendUrl = frontendUrl.replace("http://", "https://");
    }

    // Build return URL with query parameters
    const returnUrl = `${frontendUrl}/user/dashboard?payment_status={order_status}&order_id={order_id}&member_id=${memberId}`;

    // Handle notify URL (webhook) - use HTTPS for production
    let backendUrl = cleanUrl(process.env.BACKEND_URL) || 'http://localhost:5000';

    // For Cashfree production environment, ensure HTTPS
    if (process.env.NODE_ENV === "production" && backendUrl.startsWith("http://")) {
      backendUrl = backendUrl.replace("http://", "https://");
    }

    const notifyUrl = `${backendUrl}/payments/webhook`;

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
      url: `${CASHFREE_BASE}/orders`,
      amount: amount,
      customer_id: memberId,
      return_url: returnUrl,
      notify_url: notifyUrl
    });

    const response = await axios.post(`${CASHFREE_BASE}/orders`, cashfreeBody, {
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

    const response = await axios.get(`${CASHFREE_BASE}/orders/${orderId}`, { headers });

    // Update our payment record
    payment.status = response.data.order_status;
    payment.rawResponse = response.data;
    await payment.save();

    res.json({
      success: true,
      data: {
        orderId: response.data.order_id,
        status: response.data.order_status,
        paymentDetails: response.data.payment_details || null
      }
    });
  } catch (error) {
    console.error("Error verifying payment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify payment",
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
    console.log("📦 Webhook Headers:", req.headers);

    const signature = req.headers["x-webhook-signature"];
    const timestamp = req.headers["x-webhook-timestamp"];
    const secret = process.env.CASHFREE_SECRET_KEY;

    if (!signature || !timestamp) {
      console.warn("❌ Missing webhook signature or timestamp");
      return res.status(400).send("Missing signature or timestamp");
    }

    // Handle raw body - ensure we have the exact string that was signed
    let rawBody;
    if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString('utf8');
    } else if (typeof req.body === 'string') {
      rawBody = req.body;
    } else {
      rawBody = JSON.stringify(req.body);
    }
    console.log("📄 Raw webhook body:", rawBody);

    const payload = `${timestamp}${rawBody}`;
    const genSig = crypto.createHmac("sha256", secret).update(payload).digest("base64");

    if (genSig !== signature) {
      console.warn("❌ Invalid Cashfree signature");
      console.log("Expected:", genSig);
      console.log("Received:", signature);
      return res.status(401).send("Invalid signature");
    }

    const data = typeof req.body === 'object' && !Buffer.isBuffer(req.body)
      ? req.body
      : JSON.parse(rawBody);
    console.log("✅ Verified webhook data:", JSON.stringify(data, null, 2));

    const orderId = data.data?.order?.order_id || data.data?.order_id || data.order_id;

    const paymentTransaction = await TransactionModel.findOne({
      transaction_id: orderId
    });

    if (!paymentTransaction) {
      console.warn("❌ Transaction not found for order:", orderId);
      return res.status(404).send("Transaction not found");
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

    const orderStatus = data.data?.order?.order_status || data.data?.order_status || data.order_status;
    const isSuccessful = orderStatus === "PAID";
    const status = isSuccessful ? "Completed" : "Failed";

    // AMOUNT VERIFICATION - Critical security check
    if (data.data?.payment || data.payment) {
      const paymentData = data.data?.payment || data.payment;
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
        return res.status(400).json({
          success: false,
          message: "Payment amount mismatch - contact support",
          order_id: orderId
        });
      }

      paymentTransaction.payment_details = {
        payment_method: paymentData.payment_method,
        bank_reference: paymentData.bank_reference,
        payment_time: paymentData.payment_time,
        payment_amount: receivedAmount
      };
    }

    paymentTransaction.status = status;
    paymentTransaction.description = `Payment ${orderStatus} - ${data.data?.payment_message || data.payment_message || 'Processed'}`;
    paymentTransaction.webhook_processed = true;
    paymentTransaction.webhook_processed_at = new Date();

    await paymentTransaction.save();
    console.log("✅ Payment transaction updated with status:", status);

    // Update payment record in Payment collection
    const paymentRecord = await PaymentModel.findOne({ orderId: orderId });
    if (paymentRecord) {
      paymentRecord.status = orderStatus;
      paymentRecord.notifications.push(data);
      paymentRecord.rawResponse = data;
      await paymentRecord.save();
    }

    // Process loan repayment ONLY after confirmed payment success
    if (isSuccessful && paymentTransaction.is_loan_repayment) {
      console.log("💰 Processing loan repayment after confirmed payment...");
      await processLoanRepayment(paymentTransaction, data);
    }
    // Note: We no longer call revertLoanRepayment because loan is never pre-emptively updated

    console.log("✅ Webhook processing completed successfully");
    res.status(200).json({
      success: true,
      message: "Webhook processed successfully",
      order_id: orderId,
      status: orderStatus
    });
  } catch (err) {
    console.error("❌ WEBHOOK ERROR =====================");
    console.error("Error name:", err.name);
    console.error("Error message:", err.message);
    console.error("Stack trace:", err.stack);
    res.status(500).send("Internal error");
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

    const response = await axios.post(`${CASHFREE_BASE}/orders/${orderId}/retry`, retryBody, { headers });

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