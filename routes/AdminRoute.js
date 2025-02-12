const getTransactionDetails = require("../controllers/Transaction/Transaction");
const { getMemberDetails } = require("../controllers/Users/Profile/Profile");
const { editTicket, getTickets } = require("../controllers/Users/Ticket/TicketConntroller");
const Authenticated = require("../middlewares/auth");
const authorizeRoles = require("../middlewares/authorizeRole");

const router = require("express").Router();


router.get("/members",Authenticated,authorizeRoles("ADMIN"),getMemberDetails)
router.get("/transactions",Authenticated,authorizeRoles("ADMIN"),getTransactionDetails)
router.put("/ticket/:id" ,Authenticated,authorizeRoles("ADMIN"), editTicket)
router.get("/tickets" ,Authenticated,authorizeRoles("ADMIN"), getTickets)
module.exports = router;
