const getTransactionDetails = require("../controllers/Transaction/Transaction");
const { getEpins, transferEpin } = require("../controllers/Users/Epin/epin");
const {
  getMemberDetails,
  UpdateMemberDetails,
} = require("../controllers/Users/Profile/Profile");
const { getSponsers } = require("../controllers/Users/Sponser/sponser");
const { createTicket, getTickets } = require("../controllers/Users/Ticket/TicketConntroller");
const Authenticated = require("../middlewares/auth");


const router = require("express").Router();

router.get("/member/:id",Authenticated, getMemberDetails);
router.put("/member/:memberId",Authenticated, UpdateMemberDetails);
router.get("/transactions/:id",Authenticated,getTransactionDetails)
router.post("/ticket" ,Authenticated,createTicket)
router.get("/ticket/:id" ,Authenticated,getTickets)
router.get("/epin" ,Authenticated,getEpins)
router.get('/sponsers',Authenticated,getSponsers)
router.put('/transferPackage',Authenticated,transferEpin)

module.exports = router;

