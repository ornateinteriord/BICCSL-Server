const express = require("express");
const router = express.Router();
const Authenticated = require("../middlewares/auth");
const ChatController = require("../controllers/Chat/ChatController");

// All chat routes require authentication
router.use(Authenticated);

// Get all chat rooms for logged-in user
router.get("/rooms", ChatController.getRooms);

// Get messages for a specific room (with pagination)
router.get("/messages/:roomId", ChatController.getMessages);

// Create or get existing chat room
router.post("/room/create", ChatController.createRoom);

// Mark messages as read
router.patch("/mark-read/:roomId", ChatController.markAsRead);

// Search member by mobile number to start chat
router.get("/search", ChatController.searchMember);

// Send a message via REST API (alternative to WebSocket for Vercel)
router.post("/message/send", ChatController.sendMessage);

// Get or create support chat with admin (auto-connect for users)
router.get("/support", ChatController.getSupportChat);

module.exports = router;
