const getTransactionDetails = require("../controllers/Transaction/Transaction");
const { getEpins, transferEpin, getPackageHistory } = require("../controllers/Users/Epin/epin");
const {
  getMemberDetails,
  UpdateMemberDetails,
  activateMemberPackage,
} = require("../controllers/Users/Profile/Profile");
const { getSponsers, checkSponsorReward } = require("../controllers/Users/Sponser/sponser");
const { getMultiLevelSponsorship } = require("../controllers/Users/Sponser/multiLevelSponsorship");
const { createTicket, getTickets } = require("../controllers/Users/Ticket/TicketConntroller");
const Authenticated = require("../middlewares/auth");
const { getWalletWithdraw, getWalletOverview } = require("../controllers/Users/walletServiece.js/walletServies");


const router = require("express").Router();

router.get("/member/:id",Authenticated, getMemberDetails);
router.put("/member/:memberId",Authenticated, UpdateMemberDetails);
router.get("/transactions",Authenticated,getTransactionDetails)
router.post("/ticket" ,Authenticated,createTicket)
router.get("/ticket/:id" ,Authenticated,getTickets)
router.get("/epin" ,Authenticated,getEpins)
router.get('/sponsers/:memberId',Authenticated,getSponsers)
router.put('/transferPackage',Authenticated,transferEpin)
router.get('/package-history',Authenticated,getPackageHistory)
router.get("/check-sponsor-reward/:memberId", Authenticated, checkSponsorReward);
router.get('/multi-level-sponsors',Authenticated,getMultiLevelSponsorship)
router.get("/overview/:memberId",Authenticated, getWalletOverview);
router.post("/withdraw", Authenticated,getWalletWithdraw);
router.put("/activate-package/:memberId",Authenticated, activateMemberPackage);

module.exports = router;