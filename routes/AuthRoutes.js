const { signup, login, getSponsorDetails } = require("../controllers/Auth/AuthController");

const router = require("express").Router();

router.post("/signup", signup);
router.get("/get-sponsor/:ref", getSponsorDetails);
router.post("/login", login);

module.exports = router;
