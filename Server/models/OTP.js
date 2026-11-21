const mongoose = require("mongoose");
const mailSender = require("../utils/mailSender");
const emailTemplate = require("../mail/templates/emailVerificationTemplate");

const OTPSchema = new mongoose.Schema({
    email:{
        type:String,
        required: true,
    },
    otp: {
        type:String,
        required:true,
    },
    createdAt: {
        type:Date,
        default:Date.now,
        expires: 5*60,
    }
});

async function sendVerificationOTP(email, otp) {
    try {
        const mailResponse = await mailSender(email,
			"Verification Email",
			emailTemplate(otp))
        if (!mailResponse) {
            throw new Error("Verification email could not be sent");
        }
        console.log("Verification email sent to", email);
    } catch (error) {
        console.log("error occured while sending mails: ", error);
        throw error;
    }
}

OTPSchema.pre("save", async function (next) {
    console.log("Mail in pre hook", this.email)
    await sendVerificationOTP(this.email, this.otp);
    next();
}) 

module.exports = mongoose.model("OTP", OTPSchema);