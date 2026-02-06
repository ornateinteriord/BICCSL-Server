const MessageModel = require("../../models/Message/Message");
const ChatRoomModel = require("../../models/ChatRoom/ChatRoom");
const MemberModel = require("../../models/Users/Member");
const AdminModel = require("../../models/Admin/Admin");

// Get all chat rooms for the logged-in user
const getRooms = async (req, res) => {
    try {
        const userId = req.user.Member_id || req.user.memberId || req.user.id;
        const userRole = req.user.role;

        let rooms;

        // If user is admin, find ALL support chat rooms (any room with ADMIN_* participant)
        if (userRole === 'admin' || userRole === 'ADMIN') {
            rooms = await ChatRoomModel.find({
                participants: { $regex: /^ADMIN_/ }
            })
                .sort({ lastMessageTime: -1 })
                .lean();
        } else {
            // For regular users, find rooms where they are a participant
            rooms = await ChatRoomModel.find({
                participants: userId,
            })
                .sort({ lastMessageTime: -1 })
                .lean();
        }

        // Convert unreadCount Map to object and get count for current user
        const roomsWithUnread = rooms.map((room) => {
            let unreadCount = 0;

            if (userRole === 'admin' || userRole === 'ADMIN') {
                // For admin, check all admin ID variations
                unreadCount = room.unreadCount?.['ADMIN_1'] ||
                    room.unreadCount?.['ADMIN_2'] ||
                    room.unreadCount?.[`ADMIN_${req.user.id}`] || 0;
            } else {
                // For regular users, only get their own unread count
                unreadCount = room.unreadCount?.[userId] || 0;
            }

            return {
                ...room,
                unreadCount,
            };
        });

        res.status(200).json({
            success: true,
            data: roomsWithUnread,
        });
    } catch (error) {
        console.error("Error fetching rooms:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch chat rooms",
            error: error.message,
        });
    }
};

// Get messages for a specific room (with pagination)
// TEMPORARILY DISABLED - Will be re-enabled later
const getMessages = async (req, res) => {
    return res.status(503).json({
        success: false,
        message: "Chat messages feature is temporarily disabled",
    });
    /*
    try {
        const { roomId } = req.params;
        const userId = req.user.Member_id || req.user.memberId || req.user.id;
        const userRole = req.user.role;
        const limit = parseInt(req.query.limit) || 50;
        const skip = parseInt(req.query.skip) || 0;

        // Verify user is part of the room
        let room;
        if (userRole === 'admin' || userRole === 'ADMIN') {
            // Admin can access any support chat room (rooms with ADMIN_* participant)
            room = await ChatRoomModel.findOne({
                roomId,
                participants: { $regex: /^ADMIN_/ }
            });
        } else {
            // Regular users can only access rooms they're a participant of
            room = await ChatRoomModel.findOne({
                roomId,
                participants: userId,
            });
        }

        if (!room) {
            return res.status(403).json({
                success: false,
                message: "Access denied to this chat room",
            });
        }

        const messages = await MessageModel.find({ roomId })
            .sort({ createdAt: 1 })
            .skip(skip)
            .limit(limit)
            .lean();

        res.status(200).json({
            success: true,
            data: messages,
        });
    } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch messages",
            error: error.message,
        });
    }
    */
};

// Create or get existing chat room between two users
const createRoom = async (req, res) => {
    try {
        const { recipientId } = req.body;
        const userId = req.user.Member_id || req.user.memberId || req.user.id;

        if (!recipientId) {
            return res.status(400).json({
                success: false,
                message: "Recipient ID is required",
            });
        }

        // Create roomId (sorted to ensure consistency)
        const participants = [userId, recipientId].sort();
        const roomId = participants.join("_");

        // Check if room already exists
        let chatRoom = await ChatRoomModel.findOne({ roomId });

        if (chatRoom) {
            return res.status(200).json({
                success: true,
                data: chatRoom,
                message: "Chat room already exists",
            });
        }

        // Get participant details
        const participantDocs = await MemberModel.find({
            Member_id: { $in: participants },
        });

        if (participantDocs.length !== 2) {
            return res.status(404).json({
                success: false,
                message: "One or both users not found",
            });
        }

        const participantDetails = participantDocs.map((p) => ({
            memberId: p.Member_id,
            name: p.Name,
            role: p.Member_id === userId ? req.user.role || "USER" : "USER",
            profileImage: p.profile_image || "",
        }));

        // Create new room
        chatRoom = new ChatRoomModel({
            roomId,
            participants,
            participantDetails,
            unreadCount: new Map(),
        });

        await chatRoom.save();

        res.status(201).json({
            success: true,
            data: chatRoom,
            message: "Chat room created successfully",
        });
    } catch (error) {
        console.error("Error creating room:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create chat room",
            error: error.message,
        });
    }
};

// Mark messages as read
const markAsRead = async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.Member_id || req.user.memberId || req.user.id;
        const userRole = req.user.role;

        // Verify user is part of the room
        let room;
        let currentUserId = userId;

        if (userRole === 'admin' || userRole === 'ADMIN') {
            // Admin can access any support chat room
            room = await ChatRoomModel.findOne({
                roomId,
                participants: { $regex: /^ADMIN_/ }
            });
            // Use admin ID format for unread count
            currentUserId = `ADMIN_${req.user.id || '1'}`;
        } else {
            room = await ChatRoomModel.findOne({
                roomId,
                participants: userId,
            });
        }

        if (!room) {
            return res.status(403).json({
                success: false,
                message: "Access denied to this chat room",
            });
        }

        // Mark all unread messages as read (for admin, mark messages sent TO any ADMIN_*)
        if (userRole === 'admin' || userRole === 'ADMIN') {
            await MessageModel.updateMany(
                { roomId, recipientId: { $regex: /^ADMIN_/ }, isRead: false },
                { $set: { isRead: true } }
            );
            // Reset unread count for all admin IDs
            room.unreadCount.set('ADMIN_1', 0);
            room.unreadCount.set('ADMIN_2', 0);
            room.unreadCount.set(currentUserId, 0);
        } else {
            await MessageModel.updateMany(
                { roomId, recipientId: userId, isRead: false },
                { $set: { isRead: true } }
            );
            room.unreadCount.set(userId, 0);
        }

        await room.save();

        res.status(200).json({
            success: true,
            message: "Messages marked as read",
        });
    } catch (error) {
        console.error("Error marking messages as read:", error);
        res.status(500).json({
            success: false,
            message: "Failed to mark messages as read",
            error: error.message,
        });
    }
};

// Search for members by mobile number to start chat
const searchMember = async (req, res) => {
    try {
        const { mobileNumber } = req.query;
        // Fix: Token contains 'memberId' (camelCase), not 'Member_id'. Fallback to 'id' is risky if it's an ObjectId.
        const userId = req.user.Member_id || req.user.memberId || req.user.id;

        if (!mobileNumber) {
            return res.status(400).json({
                success: false,
                message: "Mobile number is required",
            });
        }

        // Search for active members by mobile number (excluding self)
        const member = await MemberModel.findOne({
            $or: [
                { mobile: mobileNumber },
                { Mobile_Number: mobileNumber },
                { phone: mobileNumber },
                { mobileno: mobileNumber },
            ],
            Member_id: { $ne: userId },
            status: "active",
        }).select("Member_id Name username mobile Mobile_Number phone mobileno profile_image role");

        if (!member) {
            return res.status(404).json({
                success: false,
                message: "No active member found with this mobile number",
            });
        }

        // Check if chat room already exists
        const participants = [userId, member.Member_id].sort();
        const roomId = participants.join("_");

        let chatRoom = await ChatRoomModel.findOne({ roomId });

        if (!chatRoom) {
            // Get current user details
            const currentUser = await MemberModel.findOne({ Member_id: userId });

            // Create new room
            const participantDetails = [
                {
                    memberId: userId,
                    name: currentUser.Name,
                    role: req.user.role || "USER",
                    profileImage: currentUser.profile_image || "",
                },
                {
                    memberId: member.Member_id,
                    name: member.Name,
                    role: member.role || "USER",
                    profileImage: member.profile_image || "",
                },
            ];

            chatRoom = new ChatRoomModel({
                roomId,
                participants,
                participantDetails,
                unreadCount: new Map(),
            });

            await chatRoom.save();
        }

        res.status(200).json({
            success: true,
            data: {
                member: {
                    Member_id: member.Member_id,
                    Name: member.Name,
                    username: member.username,
                    mobile: member.mobile || member.Mobile_Number || member.phone || member.mobileno,
                    profile_image: member.profile_image,
                    role: member.role,
                },
                chatRoom,
            },
            message: chatRoom.isNew ? "Chat room created successfully" : "Chat room already exists",
        });
    } catch (error) {
        console.error("Error searching member:", error);
        res.status(500).json({
            success: false,
            message: "Failed to search member",
            error: error.message,
        });
    }
};

// Send a message via REST API (alternative to WebSocket for Vercel deployment)
// TEMPORARILY DISABLED - Will be re-enabled later
const sendMessage = async (req, res) => {
    return res.status(503).json({
        success: false,
        message: "Chat send message feature is temporarily disabled",
    });
    /*
    try {
        const { roomId, text } = req.body;
        let userId = req.user.Member_id || req.user.memberId || req.user.id;
        const userRole = req.user.role;

        console.log("sendMessage - req.user:", req.user);
        console.log("sendMessage - initial userId:", userId, "role:", userRole);

        if (!roomId || !text || !text.trim()) {
            return res.status(400).json({
                success: false,
                message: "Room ID and message text are required",
            });
        }

        // Get sender details - check MemberModel first, then AdminModel for support chat
        let sender = await MemberModel.findOne({ Member_id: userId });
        let senderName = sender?.Name;
        let senderRole = userRole || "USER";
        let senderId = userId; // Default senderId

        // If not found in MemberModel, check if it's an admin
        if (!sender && (userRole === 'admin' || userRole === 'ADMIN')) {
            // Try to find by MongoDB _id first, then by id field
            let adminUser = null;

            // Check if userId looks like a MongoDB ObjectId
            if (userId.length === 24) {
                try {
                    adminUser = await AdminModel.findById(userId);
                } catch (e) {
                    console.log("sendMessage - Not a valid ObjectId:", userId);
                }
            }

            // If not found by _id, try by other fields
            if (!adminUser) {
                adminUser = await AdminModel.findOne({
                    $or: [
                        { id: req.user.id },
                        { id: userId },
                        { username: req.user.username }
                    ]
                });
            }

            console.log("sendMessage - adminUser found:", adminUser);

            if (adminUser) {
                senderName = adminUser.username || 'Support';
                senderRole = 'ADMIN';
                // Always use ADMIN_1 for consistency
                senderId = 'ADMIN_1';
                sender = { Name: senderName }; // Create a mock sender object
                console.log("sendMessage - using admin senderId:", senderId);
            }
        }

        if (!sender) {
            return res.status(404).json({
                success: false,
                message: "Sender not found",
            });
        }

        // Find the chat room
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
                role: p.Member_id === userId ? req.user.role || "USER" : "USER",
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
        const recipient = chatRoom.participants.find((p) => p !== senderId);
        if (recipient) {
            const currentCount = chatRoom.unreadCount.get(recipient) || 0;
            chatRoom.unreadCount.set(recipient, currentCount + 1);
        }

        await chatRoom.save();

        // Create message
        const message = new MessageModel({
            roomId,
            senderId: senderId,
            senderName: senderName,
            senderRole: senderRole,
            recipientId: recipient || "",
            text: text.trim(),
            isRead: false,
        });

        await message.save();

        res.status(201).json({
            success: true,
            data: {
                _id: message._id,
                roomId: message.roomId,
                senderId: message.senderId,
                senderName: message.senderName,
                senderRole: message.senderRole,
                text: message.text,
                isRead: message.isRead,
                createdAt: message.createdAt,
            },
            message: "Message sent successfully",
        });
    } catch (error) {
        console.error("Error sending message:", error);
        res.status(500).json({
            success: false,
            message: "Failed to send message",
            error: error.message,
        });
    }
    */
};

// Get or create support chat with admin (auto-connect for users)
const getSupportChat = async (req, res) => {
    try {
        const userId = req.user.Member_id || req.user.memberId || req.user.id;

        // Find the main support admin from admin_tbl
        const supportAdmin = await AdminModel.findOne({
            $or: [
                { id: "1" },
                { id: 1 },
                { username: "admin" },
                { role: "admin" }
            ],
            STATUS: "active"
        });

        if (!supportAdmin) {
            return res.status(404).json({
                success: false,
                message: "Support admin not available",
            });
        }

        // Always use ADMIN_1 for support chat consistency
        const adminId = 'ADMIN_1';

        // Create roomId (sorted to ensure consistency)
        const participants = [userId, adminId].sort();
        const roomId = participants.join("_");

        // Check if room already exists
        let chatRoom = await ChatRoomModel.findOne({ roomId });

        if (!chatRoom) {
            // Get current user details
            const currentUser = await MemberModel.findOne({ Member_id: userId });

            if (!currentUser) {
                return res.status(404).json({
                    success: false,
                    message: "User not found",
                });
            }

            // Create new support room
            const participantDetails = [
                {
                    memberId: userId,
                    name: currentUser.Name,
                    role: "USER",
                    profileImage: currentUser.profile_image || "",
                },
                {
                    memberId: adminId,
                    name: supportAdmin.username || "Support",
                    role: "ADMIN",
                    profileImage: "",
                },
            ];

            chatRoom = new ChatRoomModel({
                roomId,
                participants,
                participantDetails,
                unreadCount: new Map(),
            });

            await chatRoom.save();
        }

        res.status(200).json({
            success: true,
            data: chatRoom,
            message: chatRoom.isNew ? "Support chat created" : "Support chat found",
        });
    } catch (error) {
        console.error("Error getting support chat:", error);
        res.status(500).json({
            success: false,
            message: "Failed to connect to support",
            error: error.message,
        });
    }
};

module.exports = {
    getRooms,
    getMessages,
    createRoom,
    markAsRead,
    searchMember,
    sendMessage,
    getSupportChat,
};
