const { getHoliday, addHoliday } = require("../controllers/Admin/Holiday/HolidayController");
const { getNews, addNews } = require("../controllers/Admin/news/NewsController");
const getTransactionDetails = require("../controllers/Transaction/Transaction");
const { getEpinsSummary } = require("../controllers/Users/Epin/epin");
const { getMemberDetails, UpdateMemberDetails, getMember } = require("../controllers/Users/Profile/Profile");
const { editTicket, getTickets } = require("../controllers/Users/Ticket/TicketConntroller");
const Authenticated = require("../middlewares/auth");
const authorizeRoles = require("../middlewares/authorizeRole");

const router = require("express").Router();


router.get("/members",Authenticated,authorizeRoles("ADMIN"),getMemberDetails)
router.get("/transactions",Authenticated,authorizeRoles("ADMIN"),getTransactionDetails)
router.put("/ticket/:id" ,Authenticated,authorizeRoles("ADMIN"), editTicket)
router.get("/tickets" ,Authenticated,authorizeRoles("ADMIN"), getTickets)
router.get("/epin-summary" ,Authenticated,authorizeRoles("ADMIN"), getEpinsSummary)
router.put('/update-member/:memberId',Authenticated,authorizeRoles("ADMIN"),UpdateMemberDetails)
router.get('/get-member/:memberId',Authenticated,authorizeRoles("ADMIN"),getMember)
router.get('/getnews',Authenticated,authorizeRoles("ADMIN"),getNews)
router.post('/addnews',Authenticated,authorizeRoles("ADMIN"),addNews)
router.get('/getholiday',Authenticated,authorizeRoles("ADMIN"),getHoliday)
router.post('/addholiday',Authenticated,authorizeRoles("ADMIN"),addHoliday)

module.exports = router;
