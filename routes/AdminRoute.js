const getTransactionDetails = require("../controllers/Transaction/Transaction");
const Authenticated = require("../middlewares/auth");
const authorizeRoles = require("../middlewares/authorizeRole");

const router = require("express").Router();

router.get("/transactions",Authenticated,authorizeRoles("ADMIN"),getTransactionDetails)
module.exports = router;
