const {
  getMemberDetails,
  UpdateMemberDetails,
} = require("../controllers/Users/Profile/Profile");

const router = require("express").Router();

router.get("/member/:id", getMemberDetails);
router.put("/member/:id", UpdateMemberDetails);

module.exports = router;
