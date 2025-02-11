const getTransactionDetails = require("../controllers/Transaction/Transaction");
const {
  getMemberDetails,
  UpdateMemberDetails,
} = require("../controllers/Users/Profile/Profile");

const router = require("express").Router();

router.get("/member/:id", getMemberDetails);
router.put("/member/:id", UpdateMemberDetails);
router.get("/transactions/:id",getTransactionDetails)

module.exports = router;
