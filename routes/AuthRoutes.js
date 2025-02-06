const login = require("../controllers/Auth/AuthController");

const router = require("express").Router();

router.post("/login", login);

module.exports = router;
