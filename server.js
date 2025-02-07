const express = require("express");
const cors = require("cors");
require("dotenv").config();
require("./models/db");
const AuthRoutes = require('./routes/AuthRoutes')



const app = express();

//middleware
app.use(express.json());
app.use(
  cors({
    origin: "*",
    methods: ["POST", "GET", "PUT", "DELETE","PATCH"],
    credentials: true,
  })
);

//router
app.use('/auth', AuthRoutes)
// app.use('/user')

app.get('/', (req , res)=>{
  res.send('Welcome to BICCSL Server')
})

//server
const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`server is running on ${PORT}`);
});
