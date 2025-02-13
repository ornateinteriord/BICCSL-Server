const getTransactionDetails = require("../controllers/Transaction/Transaction");
const { getMemberDetails } = require("../controllers/Users/Profile/Profile");
const Authenticated = require("../middlewares/auth");
const authorizeRoles = require("../middlewares/authorizeRole");

const router = require("express").Router();


router.get("/members",Authenticated,authorizeRoles("ADMIN"),getMemberDetails)
router.get("/transactions",Authenticated,authorizeRoles("ADMIN"),getTransactionDetails)
module.exports = router;
