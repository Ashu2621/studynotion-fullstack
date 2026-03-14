const OTP = require("../models/OTP");
const User = require("../models/User");
const otpGenerator = require("otp-generator");
const bcrypt = require("bcrypt");
const Profile = require("../models/Profile");
const jwt = require("jsonwebtoken");
const mailSender = require("../utils/mailSender");
const { passwordUpdated } = require("../mail/templates/passwordUpdate");

require("dotenv").config();


// =============================
// SEND OTP
// =============================
exports.sendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    console.log("Email in sendOtp controller:", email);

    // check existing user
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(401).json({
        success: false,
        message: "Email already registered",
      });
    }

    // generate otp
    let otp = otpGenerator.generate(6, {
      upperCaseAlphabets: false,
      lowerCaseAlphabets: false,
      specialChars: false,
    });

    // check duplicate otp
    let result = await OTP.findOne({ otp });

    while (result) {
      otp = otpGenerator.generate(6, {
        upperCaseAlphabets: false,
        lowerCaseAlphabets: false,
        specialChars: false,
      });

      result = await OTP.findOne({ otp });
    }

    console.log("OTP generated:", otp);

    // save otp
    const otpPayload = { email, otp };
    const otpBody = await OTP.create(otpPayload);

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      otpBody,
    });

  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "OTP send failed",
    });
  }
};


// =============================
// SIGNUP
// =============================
exports.signUp = async (req, res) => {
  try {

    const {
      firstName,
      lastName,
      email,
      password,
      confirmPassword,
      accountType,
      otp,
      contactNumber
    } = req.body;

    // check required fields
    if (!firstName || !lastName || !email || !password || !confirmPassword || !otp) {
      return res.status(403).json({
        success: false,
        message: "All fields are required",
      });
    }

    // password match check
    if (password !== confirmPassword) {
      return res.status(403).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    // check existing user
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(401).json({
        success: false,
        message: "User already registered",
      });
    }

    // find recent OTP
    const recentOtp = await OTP.find({ email }).sort({ createdAt: -1 }).limit(1);

    // check OTP exists
    if (recentOtp.length === 0) {
      return res.status(400).json({
        success: false,
        message: "OTP not found",
      });
    }

    console.log("OTP in signup:", recentOtp[0].otp);

    // verify OTP
    if (otp.toString() !== recentOtp[0].otp.toString()) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    // hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // instructor approval
    const approved = accountType === "Instructor" ? false : true;

    // create profile
    const profileDetails = await Profile.create({
      gender: null,
      dateOfBirth: null,
      about: null,
      contactNumber: null,
    });

    // create user
    const user = await User.create({
      firstName,
      lastName,
      email,
      contactNumber,
      password: hashedPassword,
      accountType,
      approved,
      additionalDetails: profileDetails._id,
      image: `https://api.dicebear.com/5.x/initials/svg?seed=${firstName} ${lastName}`,
    });

    return res.status(200).json({
      success: true,
      message: "User registered successfully",
      user,
    });

  } catch (error) {

    console.log(error);

    return res.status(500).json({
      success: false,
      message: "User cannot be registered",
    });
  }
};


// =============================
// LOGIN
// =============================
exports.login = async (req, res) => {

  try {

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email or Password missing",
      });
    }

    const user = await User.findOne({ email }).populate("additionalDetails").exec();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not registered",
      });
    }

    // password match
    if (await bcrypt.compare(password, user.password)) {

      const payload = {
        email: user.email,
        id: user._id,
        accountType: user.accountType,
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: "2h",
      });

      user.token = token;
      user.password = undefined;

      const options = {
        expires: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        httpOnly: true,
      };

      return res.cookie("token", token, options).status(200).json({
        success: true,
        message: "Login successful",
        token,
        user,
      });

    } else {

      return res.status(401).json({
        success: false,
        message: "Password incorrect",
      });

    }

  } catch (error) {

    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Login failure",
    });

  }
};


// =============================
// CHANGE PASSWORD
// =============================
exports.changePassword = async (req, res) => {

  try {

    const userDetails = await User.findById(req.user.id);

    const { oldPassword, newPassword } = req.body;

    const isPasswordMatch = await bcrypt.compare(
      oldPassword,
      userDetails.password
    );

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: "Old password incorrect",
      });
    }

    const encryptedPassword = await bcrypt.hash(newPassword, 10);

    const updatedUserDetails = await User.findByIdAndUpdate(
      req.user.id,
      { password: encryptedPassword },
      { new: true }
    );

    // send email
    try {

      const emailResponse = await mailSender(
        updatedUserDetails.email,
        passwordUpdated(
          updatedUserDetails.email,
          `Password updated successfully for ${updatedUserDetails.firstName} ${updatedUserDetails.lastName}`
        )
      );

      console.log("Email sent successfully:", emailResponse.response);

    } catch (error) {

      console.log("Email error:", error);

      return res.status(500).json({
        success: false,
        message: "Error sending email",
      });

    }

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });

  } catch (error) {

    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Password update failed",
    });

  }
};