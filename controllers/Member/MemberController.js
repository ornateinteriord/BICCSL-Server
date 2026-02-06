const MemberModel = require("../../models/Users/Member");

// Get all members that a user can chat with (excluding self)
const getChatableMembers = async (req, res) => {
    try {
        const userId = req.user.Member_id || req.user.id;
        const userRole = req.user.role;

        let query = {
            Member_id: { $ne: userId }, // Exclude self
            account_status: "active", // Only active members
        };

        // If user is not admin, only show other users (not admins)
        // If user is admin, show all users
        if (userRole !== "ADMIN") {
            query.role = { $ne: "ADMIN" };
        }

        const members = await MemberModel.find(query)
            .select("Member_id Name username email profile_image role")
            .sort({ Name: 1 })
            .limit(100)
            .lean();

        res.status(200).json({
            success: true,
            data: members,
        });
    } catch (error) {
        console.error("Error fetching members:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch members",
            error: error.message,
        });
    }
};

module.exports = {
    getChatableMembers,
};
