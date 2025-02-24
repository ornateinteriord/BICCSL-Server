const EpinModel = require("../../../models/Epin/epin");

const getEpins = async (req, res) => {
    try {
        const { status } = req.query;
        const purchasedby = req.user?.memberId; 

        if (!purchasedby) {
            return res.status(400).json({ success: false, message: "Invalid User" });
        }

        let filter = { purchasedby };
        if (status) filter.status = status;

        const epins = await EpinModel.find(filter);
        res.status(200).json({ success: true, data: epins });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const getEpinsSummary = async (req, res) => {
    try {
        const activeEpins = await EpinModel.aggregate([
            { $match: { status: "active" } },
            { $group: { _id: "$purchasedby", count: { $sum: 1 } } },
            { $project: { memberCode: "$_id", usedQuantity: "$count", status: "active", _id: 0 } }
        ]);

        const usedEpins = await EpinModel.aggregate([
            { $match: { status: "used" } },
            { $group: { _id: "$purchasedby", count: { $sum: 1 } } },
            { $project: { memberCode: "$_id", usedQuantity: "$count", status: "used", _id: 0 } }
        ]);
        const totalEpins = await EpinModel.aggregate([
            { $group: { _id: "$purchasedby", count: { $sum: 1 } } },
            { $project: { memberCode: "$_id", totalQuantity: "$count", _id: 0 } }
        ]);

        res.status(200).json({
            success: true,
            data: {
                activeEpins,
                usedEpins,
                totalEpins
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


module.exports = { getEpins , getEpinsSummary};