const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema(
  {
    member: { type: mongoose.Schema.Types.ObjectId, ref: "member_tbl" },
    memberId: { type: String },
    orderId: { type: String, index: true, unique: true },
    cfOrderId: { type: String },
    paymentSessionId: { type: String },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: [
        // Cashfree order_status values
        "ACTIVE",
        "PAID",
        "EXPIRED",
        "CANCELLED",
        "CREATED",
        "PENDING",
        "FAILED",
        "USER_DROPPED",
        "VOID",
      ],
      default: "CREATED",
    },
    customer: {
      customer_id: { type: String },
      customer_name: { type: String },
      customer_email: { type: String },
      customer_phone: { type: String },
    },
    notifications: [{ type: mongoose.Schema.Types.Mixed }],
    rawResponse: { type: mongoose.Schema.Types.Mixed },
    paymentInfo: { type: mongoose.Schema.Types.Mixed },
    notes: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", PaymentSchema);


