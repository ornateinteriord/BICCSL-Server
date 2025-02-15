const mongoose = require("mongoose");
const AutoIncrement = require("mongoose-sequence")(mongoose);

const epinSchema = new mongoose.Schema({
    epin_id: { type: Number, unique: true, },
    date: { type: String, },
    epin_no: { type: String, unique: true, },
    purchasedby: { type: String, }, 
    spackage: { type: String, }, 
    amount: { type: Number, },
    status: { type: String, enum: ["active", "used"]},
    used_on: { type: String, default: null }, 
    used_for: { type: String, default: null }, 
    generated_by: { type: String, }, 
}, { timestamps: true , collection: "epin_tbl" });

epinSchema.plugin(AutoIncrement, { inc_field: "epin_id" });

const EpinModel = mongoose.model("epin_tbl", epinSchema);
module.exports = EpinModel;
