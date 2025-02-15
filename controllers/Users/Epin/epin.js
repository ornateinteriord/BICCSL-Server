const EpinModel = require("../../../models/Epin/epin");


const getEpins = async (req, res) => {
    try {
        const { purchasedby, status } = req.query;

        let filter = {};
        if (purchasedby) filter.purchasedby = purchasedby;
        if (status) filter.status = status;

        const epins = await EpinModel.find(filter);
        res.status(200).json({ success: true, data: epins });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getEpins };