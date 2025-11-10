const axios = require("axios");
const crypto = require("crypto");
const mongoose = require("mongoose");
const TransactionModel = require("../../models/Transaction/Transaction");
const MemberModel = require("../../models/Users/Member");

const CASHFREE_BASE = "https://sandbox.cashfree.com/pg";

exports.createOrder = async (req, res) => {
  try {
    console.log("🟢 CREATE ORDER STARTED =====================");
    console.log("📦 Request Body:", JSON.stringify(req.body, null, 2));
    
    // Extract data from the simple format
    const { amount, memberId, isLoanRepayment = true, currency = "INR" } = req.body;

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
    // Fetch member details from database
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
      
      // Find the approved loan transaction
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

      // Get current due amount
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

      // Calculate new due amount after this repayment
      newDueAmount = currentDueAmount - amount;
      console.log("📊 Amount calculation:", {
        current_due: currentDueAmount,
        repayment_amount: amount,
        new_due: newDueAmount
      });


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

    const headers = {
      "Content-Type": "application/json",
      "x-api-version": "2025-01-01",
      "x-client-id": CASHFREE_APP_ID,
      "x-client-secret": CASHFREE_SECRET_KEY,
    };


    const returnUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/user/dashboard?payment_status={order_status}&order_id={order_id}&member_id=${memberId}`;
    // Use real member details for Cashfree
    const cashfreeBody = {
      order_amount: amount,
      order_currency: currency,
      customer_details: {
        customer_id: memberId,
        customer_name: member.Name || "Customer",
        customer_email: member.email || "customer@example.com",
        customer_phone: member.mobileno || "9999999999",
      },
      order_meta: {
     returnUrl : returnUrl
      }
    };

    console.log("🚀 Sending to Cashfree:", {
      url: `${CASHFREE_BASE}/orders`,
      amount: amount,
      customer_id: memberId
    });

    const response = await axios.post(`${CASHFREE_BASE}/orders`, cashfreeBody, { 
      headers,
      timeout: 10000 
    });
    
    console.log("✅ Cashfree response received:", {
      order_id: response.data.order_id,
      status: response.status
    });

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
      net_amount: newDueAmount, // Store the updated net amount after repayment
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
    
    // If we started updating the loan transaction but failed later, we might want to revert
    // For now, we'll just log the error
    if (error.response) {
      console.error("🚨 Cashfree API Error:", {
        status: error.response.status,
        data: error.response.data,
      });
      return res.status(error.response.status || 500).json({
        success: false,
        message: error.response.data.message || "An error occurred with the payment service.",
      });
    }

    console.error("🔥 Unhandled Error:", error);
    res.status(500).json({
      success: false,
      message: "An internal server error occurred.",
    });
  } finally {
    console.log("🔚 CREATE ORDER COMPLETED =====================\n");
  }
};

exports.webhook = async (req, res) => {
  try {
    console.log("🟢 WEBHOOK RECEIVED =====================");
    console.log("📦 Webhook Headers:", req.headers);
    
    const signature = req.headers["x-webhook-signature"];
    const timestamp = req.headers["x-webhook-timestamp"];
    const secret = process.env.CASHFREE_SECRET_KEY;

    // Validate required headers
    if (!signature || !timestamp) {
      console.warn("❌ Missing webhook signature or timestamp");
      return res.status(400).send("Missing signature or timestamp");
    }

    const rawBody = req.body.toString("utf-8") || req.rawBody;
    console.log("📄 Raw webhook body:", rawBody);
    
    const payload = `${timestamp}${rawBody}`;
    const genSig = crypto.createHmac("sha256", secret).update(payload).digest("base64");

    if (genSig !== signature) {
      console.warn("❌ Invalid Cashfree signature");
      console.log("Expected:", genSig);
      console.log("Received:", signature);
      return res.status(401).send("Invalid signature");
    }

    const data = JSON.parse(rawBody);
    console.log("✅ Verified webhook data:", JSON.stringify(data, null, 2));

    // Find the payment transaction
    const paymentTransaction = await TransactionModel.findOne({ 
      transaction_id: data.order_id 
    });

    if (!paymentTransaction) {
      console.warn("❌ Transaction not found for order:", data.order_id);
      return res.status(404).send("Transaction not found");
    }

    console.log("✅ Payment transaction found:", {
      transaction_id: paymentTransaction.transaction_id,
      member_id: paymentTransaction.member_id,
      is_loan_repayment: paymentTransaction.is_loan_repayment
    });

    const isSuccessful = data.order_status === "PAID";
    const status = isSuccessful ? "Completed" : "Failed";

    // Update payment transaction status
    paymentTransaction.status = status;
    paymentTransaction.description = `Payment ${data.order_status} - ${data.payment_message || ''}`;
    
    // Add payment details if available
    if (data.payment) {
      paymentTransaction.payment_details = {
        payment_method: data.payment.payment_method,
        bank_reference: data.payment.bank_reference,
        payment_time: data.payment.payment_time,
        payment_amount: data.payment.payment_amount
      };
    }
    
    await paymentTransaction.save();
    console.log("✅ Payment transaction updated with status:", status);

    // If payment is successful and it's a loan repayment, process the repayment
    if (isSuccessful && paymentTransaction.is_loan_repayment) {
      console.log("💰 Processing loan repayment...");

      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const loanTransaction = await TransactionModel.findOne({
          member_id: paymentTransaction.member_id,
          transaction_type: "Reward Loan Request",
          status: "Approved",
        }).session(session);

        if (loanTransaction) {
          const currentDueAmount = parseFloat(loanTransaction.net_amount) || parseFloat(loanTransaction.ew_credit) || 0;
          const newDueAmount = currentDueAmount - paymentTransaction.ew_debit;

          loanTransaction.net_amount = newDueAmount.toFixed(2);
          loanTransaction.repayment_status = newDueAmount <= 0 ? "Paid" : "Partially Paid";
          loanTransaction.last_repayment_date = new Date().toISOString();

          await loanTransaction.save({ session });
        }

        await session.commitTransaction();
        session.endSession();

        console.log("✅ Loan repayment processed successfully");
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("❌ Error processing loan repayment:", error);
        // Handle the error, maybe by retrying the transaction
      }
    }

    console.log("✅ Webhook processing completed successfully");
    res.status(200).send("OK");
  } catch (err) {
    console.error("❌ WEBHOOK ERROR =====================");
    console.error("Error processing webhook:", {
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
    res.status(500).send("Internal Server Error");
  } finally {
    console.log("🔚 WEBHOOK PROCESSING COMPLETED =====================\n");
  }
};
