const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER, 
      pass: process.env.EMAIL_PASS,
    },
  });

  const sendSignupEmail = async (email, memberId, password) => {
    try {
      const mailOptions = {
        from: `"BICCSL" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Welcome to BICCSL - Your Login Credentials",
        text: `Dear Member,\n\nYour account has been successfully created!\n\nHere are your login details:\nUsername: ${memberId}\nPassword: ${password}\n\nPlease keep this information secure.\n\nBest regards,\nYour Team`,
      };
  
      await transporter.sendMail(mailOptions);
      console.log(`Signup email sent to ${email}`);
    } catch (error) {
      console.error("Error sending email:", error);
    }
  };

  module.exports = sendSignupEmail;