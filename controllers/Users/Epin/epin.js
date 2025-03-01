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
            { $group: {  _id: { purchasedby: "$purchasedby", date: "$date" },  count: { $sum: 1 } } },
            { $project: {  memberCode: "$_id.purchasedby", 
                date: "$_id.date",  totalQuantity: "$count", _id: 0 } }
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

const transferEpin = async (req, res) => {
    try {
        const { quantity, transfered_on, transfered_to } = req.body;
        const memberId = req.user?.memberId;
        const activeEpins = await EpinModel.find({ purchasedby:memberId,status: "active" });
        if (activeEpins.length === 0) {
            return res.status(400).json({ success: false, message: "No active epins available" });
        }

        if (!memberId) {
            return res.status(400).json({ success: false, message: "Invalid user" });
        }
        
        // Restrict transferring to oneself
        if (transfered_to === memberId) {
            return res.status(400).json({ success: false, message: "You cannot transfer your package to yourself" });
        }
        
        if (quantity > activeEpins.length) {
            return res.status(400).json({
                success: false,
                message: `Qty is not available`
            });
        }
        if(!transfered_to){
            return res.status(400).json({
                success: false,
                message: `Transfered to is required`
            });
        }

        const epinsToUpdate = activeEpins.slice(0, quantity);
        const epinIds = epinsToUpdate.map(epin => epin.epin_id); // Extract IDs

        // Update the epins
        await EpinModel.updateMany(
            { epin_id: { $in: epinIds } }, 
            {
                $set: {
                    transfered_by: memberId,
                    transfered_on,
                    transfered_to,
                    purchasedby: transfered_to, 
                }
            }
        );

        const updatedEpins = await EpinModel.find({ epin_id: { $in: epinIds } });

        res.status(200).json({ success: true, message: "Package transferred successfully", updatedEpins });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getEpins , getEpinsSummary , transferEpin};