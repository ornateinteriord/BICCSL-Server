const mongoose = require("mongoose");
const HolidayModel = require("../../../models/Holiday/Holiday");
const AdminModel = require("../../../models/Admin/Admin");

const getHoliday = async (req, res) => {
  try {
    const id = req.user.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid User ID" });
    }
    const Admin = await AdminModel.findById(id);
    if (!Admin) {
      return res
        .status(404)
        .json({ success: false, message: "Admin not found" });
    }
    const HolidayData = await HolidayModel.find();
    return res.status(200).json({ success: true, holiday: HolidayData });
  } catch (error) {
    console.error("Error fetching User details:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const addHoliday = async (req, res) => {
  try {
    const { holiday_desc, holiday_date } = req.body;
    if (!holiday_desc || !holiday_date) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }
    const [{ maxId = 0 } = {}] = await HolidayModel.aggregate([
      { $match: { id: { $ne: null } } },
      { $group: { _id: null, maxId: { $max: { $toInt: "$id" } } } },
    ]);

    const newHoliday = new HolidayModel({
      id: (maxId + 1).toString(),
      holiday_desc,
      holiday_date,
    });
    await newHoliday.save();
    res
      .status(201)
      .json({
        success: true,
        message: "Holiday added successfully",
        holiday: newHoliday,
      });
  } catch (error) {}
};

module.exports = { getHoliday, addHoliday };
