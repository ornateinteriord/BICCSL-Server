const mongoose = require("mongoose");

const ChatRoomSchema = new mongoose.Schema(
    {
        roomId: { type: String, required: true, unique: true, index: true },
        participants: [{ type: String, required: true }], // Array of Member_id
        participantDetails: [
            {
                memberId: String,
                name: String,
                role: String,
                profileImage: String,
            },
        ],
        lastMessage: { type: String },
        lastMessageTime: { type: Date },
        unreadCount: {
            type: Map,
            of: Number,
            default: {},
        },
    },
    { timestamps: true, collection: "chat_rooms" }
);

// Indexes for performance
ChatRoomSchema.index({ participants: 1 });
ChatRoomSchema.index({ lastMessageTime: -1 });

const ChatRoomModel = mongoose.model("chat_rooms", ChatRoomSchema);
module.exports = ChatRoomModel;
