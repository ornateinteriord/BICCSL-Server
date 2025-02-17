const getTransactionDetails = require("../controllers/Transaction/Transaction");
const { getEpins } = require("../controllers/Users/Epin/epin");
const {
  getMemberDetails,
  UpdateMemberDetails,
} = require("../controllers/Users/Profile/Profile");
const { createTicket, getTickets } = require("../controllers/Users/Ticket/TicketConntroller");
const Authenticated = require("../middlewares/auth");


const router = require("express").Router();

router.get("/member/:id",Authenticated, getMemberDetails);
router.put("/member/:memberId",Authenticated, UpdateMemberDetails);
router.get("/transactions/:id",Authenticated,getTransactionDetails)
router.post("/ticket" ,Authenticated,createTicket)
router.get("/ticket/:id" ,Authenticated,getTickets)
router.get("/epin" ,Authenticated,getEpins)

module.exports = router;

