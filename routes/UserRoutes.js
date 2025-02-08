const {
  getMemberDetails,
  UpdateMemberDetails,
} = require("../controllers/Users/Profile/Profile");

const router = require("express").Router();

router.get("/member/:memberId", getMemberDetails);
router.put("/member/:memberId", UpdateMemberDetails);

module.exports = router;
