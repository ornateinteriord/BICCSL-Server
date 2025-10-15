const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema(
  {
    transaction_id: { type: String },
    transaction_date: { type: String },
    member_id: { type: String },
    description: { type: String },
    transaction_type: { type: String },
    ew_credit: { type: String },
    ew_debit: { type: String },
  status: {
    type: String,
    enum: {
      values: ['active', 'Completed', 'Pending'],
    },
    default: 'Pending'
  },

    deduction: { type: String }, 
    net_amount: { type: String },
    withdrawal_amount: { type: String }, 
    benefit_type: { type: String, default: "direct" }, 
    previous_balance: { type: String } 
  },
  { timestamps: true, collection: "transaction_tbl" }
);

const TransactionModel = mongoose.model("transaction_tbl", TransactionSchema);
module.exports = TransactionModel;