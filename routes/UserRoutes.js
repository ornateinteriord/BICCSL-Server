const getTransactionDetails = require("../controllers/Transaction/Transaction");
const {
  getMemberDetails,
  UpdateMemberDetails,
} = require("../controllers/Users/Profile/Profile");
const Authenticated = require("../middlewares/auth");


const router = require("express").Router();

router.get("/member/:id",Authenticated, getMemberDetails);
router.put("/member/:id",Authenticated, UpdateMemberDetails);
router.get("/transactions/:id",Authenticated,getTransactionDetails)

module.exports = router;
