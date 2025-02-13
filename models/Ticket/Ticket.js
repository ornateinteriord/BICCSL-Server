const mongoose = require('mongoose');
const MemberModel = require("../Users/Member");

const ticketSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: MemberModel,
        required: true
    },
    ticket_id: { type: String, },
    ticket_no: { type: String, },
    ticket_date: { type: Date, default: Date.now },
    type_of_ticket: { type: String, },
    ticket_details: { type: String, },
    isReplied: { type: Boolean, default: false },
    reply: { type: String, },
    ticket_status: { type: String, default: "pending" },
    SUBJECT: { type: String, }
}, { timestamps: true, collection: "ticket_tbl" });

const Ticket = mongoose.model('ticket_tbl', ticketSchema);

module.exports = Ticket;