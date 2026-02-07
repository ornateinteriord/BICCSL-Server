const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
    {
        roomId: { type: String, required: true, index: true },
        senderId: { type: String, required: true, index: true },
        senderName: { type: String, required: true },
        senderRole: { type: String, enum: ["USER", "ADMIN"], default: "USER" },
        recipientId: { type: String, required: true, index: true },
        messageType: { type: String, enum: ["text", "image", "file"], default: "text" },
        text: { type: String, default: "" },
        imageUrl: { type: String, default: "" },
        fileName: { type: String, default: "" },
        fileSize: { type: Number, default: 0 },
        isRead: { type: Boolean, default: false },
    },
    { timestamps: true, collection: "messages" }
);

// Indexes for performance
MessageSchema.index({ roomId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1, createdAt: -1 });
MessageSchema.index({ recipientId: 1, isRead: 1 });

const MessageModel = mongoose.model("messages", MessageSchema);
module.exports = MessageModel;
