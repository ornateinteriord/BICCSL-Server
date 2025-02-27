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

const sendRecoveryEmail = async (email, password) => {
  try {
    const mailOptions = {
      from: `"BICCSL" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "BICCSL - Password Recovery",
      text: `Dear Member,\n\nYou requested a password recovery. Here is your password:\n ${password}\n\nPlease keep this information secure.\n\nBest regards,\nYour Team`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Password recovery email sent to ${email}`);
  } catch (error) {
    console.error("Error sending recovery email:", error);
  }
};

const sendOTPEmail = async (email, otp) => {
  try {
    const mailOptions = {
      from: `"BICCSL" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "BICCSL - OTP Verification",
      text: `Dear Member,\n\nYour OTP for password reset is: ${otp}\n\nPlease use this OTP to proceed with resetting your password.\n\nBest regards,\nYour Team`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`OTP email sent to ${email}`);
  } catch (error) {
    console.error("Error sending OTP email:", error);
  }
};

module.exports = { sendSignupEmail, sendRecoveryEmail, sendOTPEmail };
