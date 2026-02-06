const jwt = require("jsonwebtoken");
const MessageModel = require("../models/Message/Message");
const ChatRoomModel = require("../models/ChatRoom/ChatRoom");
const MemberModel = require("../models/Users/Member");

// Store active socket connections: { userId: socketId }
const activeUsers = new Map();

module.exports = (io) => {
    // JWT Authentication Middleware for Socket.IO
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth.token;

            if (!token) {
                return next(new Error("Authentication error: No token provided"));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = decoded.Member_id || decoded.id;
            socket.userRole = decoded.role || "USER";

            console.log(`✅ Socket authenticated: ${socket.userId} (${socket.userRole})`);
            next();
        } catch (error) {
            console.error("Socket authentication failed:", error.message);
            next(new Error("Authentication error: Invalid token"));
        }
    });

    io.on("connection", (socket) => {
        console.log(`🔌 User connected: ${socket.userId} | Socket ID: ${socket.id}`);

        // Store active user
        activeUsers.set(socket.userId, socket.id);

        // ==================== JOIN ROOM ====================
        socket.on("joinRoom", async ({ roomId }) => {
            try {
                socket.join(roomId);
                console.log(`📥 User ${socket.userId} joined room: ${roomId}`);

                // Update room as active
                await ChatRoomModel.findOneAndUpdate(
                    { roomId },
                    { $set: { [`unreadCount.${socket.userId}`]: 0 } },
                    { upsert: false }
                );
            } catch (error) {
                console.error("Error joining room:", error);
                socket.emit("error", { message: "Failed to join room" });
            }
        });

        // ==================== SEND MESSAGE ====================
        socket.on("sendMessage", async ({ roomId, text }) => {
            try {
                if (!text || !text.trim()) {
                    return socket.emit("error", { message: "Message cannot be empty" });
                }

                // Get sender details
                const sender = await MemberModel.findOne({ Member_id: socket.userId });
                if (!sender) {
                    return socket.emit("error", { message: "Sender not found" });
                }

                // Find or create chat room
                let chatRoom = await ChatRoomModel.findOne({ roomId });

                if (!chatRoom) {
                    // Extract participant IDs from roomId (format: userId1_userId2)
                    const participants = roomId.split("_");

                    // Get participant details
                    const participantDocs = await MemberModel.find({
                        Member_id: { $in: participants },
                    });

                    const participantDetails = participantDocs.map((p) => ({
                        memberId: p.Member_id,
                        name: p.Name,
                        role: p.Member_id === socket.userId ? socket.userRole : "USER",
                        profileImage: p.profile_image || "",
                    }));

                    chatRoom = new ChatRoomModel({
                        roomId,
                        participants,
                        participantDetails,
                        lastMessage: text.substring(0, 100),
                        lastMessageTime: new Date(),
                        unreadCount: new Map(),
                    });
                } else {
                    chatRoom.lastMessage = text.substring(0, 100);
                    chatRoom.lastMessageTime = new Date();
                }

                // Increment unread count for recipient
                const recipient = chatRoom.participants.find((p) => p !== socket.userId);
                if (recipient) {
                    const currentCount = chatRoom.unreadCount.get(recipient) || 0;
                    chatRoom.unreadCount.set(recipient, currentCount + 1);
                }

                await chatRoom.save();

                // Create message
                const message = new MessageModel({
                    roomId,
                    senderId: socket.userId,
                    senderName: sender.Name,
                    senderRole: socket.userRole,
                    recipientId: recipient || "",
                    text: text.trim(),
                    isRead: false,
                });

                await message.save();

                // Emit to all users in the room (including sender)
                io.to(roomId).emit("receiveMessage", {
                    _id: message._id,
                    roomId: message.roomId,
                    senderId: message.senderId,
                    senderName: message.senderName,
                    senderRole: message.senderRole,
                    text: message.text,
                    imageUrl: message.imageUrl,
                    isRead: message.isRead,
                    createdAt: message.createdAt,
                });

                console.log(`💬 Message sent in room ${roomId} by ${socket.userId}`);
            } catch (error) {
                console.error("Error sending message:", error);
                socket.emit("error", { message: "Failed to send message" });
            }
        });

        // ==================== TYPING INDICATOR ====================
        socket.on("typing", ({ roomId, isTyping }) => {
            socket.to(roomId).emit("userTyping", {
                userId: socket.userId,
                isTyping,
            });
        });

        // ==================== MARK AS READ ====================
        socket.on("markAsRead", async ({ roomId, messageIds }) => {
            try {
                if (messageIds && messageIds.length > 0) {
                    await MessageModel.updateMany(
                        { _id: { $in: messageIds }, recipientId: socket.userId },
                        { $set: { isRead: true } }
                    );
                }

                // Reset unread count for this user in the room
                await ChatRoomModel.findOneAndUpdate(
                    { roomId },
                    { $set: { [`unreadCount.${socket.userId}`]: 0 } }
                );

                console.log(`✅ Messages marked as read in room ${roomId}`);
            } catch (error) {
                console.error("Error marking messages as read:", error);
            }
        });

        // ==================== DISCONNECT ====================
        socket.on("disconnect", () => {
            console.log(`🔌 User disconnected: ${socket.userId} | Socket ID: ${socket.id}`);
            activeUsers.delete(socket.userId);
        });
    });

    console.log("🚀 Socket.IO chat server initialized");
};
