const crypto = require("crypto");
const { instance } = require("../config/razorpay");
const Course = require("../models/Course");
const User = require("../models/User");
const CourseProgress = require("../models/CourseProgress");
const mailSender = require("../utils/mailSender");
const { courseEnrollmentEmail } = require("../mail/templates/courseEnrollmentEmail");
const { paymentSuccessEmail } = require("../mail/templates/paymentSuccessEmail");

const isEnrolled = (course, userId) =>
    course.studentsEnrolled.some((id) => id.toString() === String(userId));

// Step 1 of checkout: validate the cart and create a Razorpay order.
exports.capturePayment = async (req, res) => {
    const { courses } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(courses) || courses.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Provide courseId",
        });
    }

    let totalAmount = 0;

    for (const courseId of courses) {
        try {
            const course = await Course.findById(courseId);
            if (!course) {
                return res.status(200).json({
                    success: false,
                    message: "Course doesn't exist",
                });
            }

            if (isEnrolled(course, userId)) {
                return res.status(200).json({
                    success: false,
                    message: "User already registered",
                });
            }

            totalAmount += parseInt(course.price, 10);
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }

    const options = {
        amount: totalAmount * 100,
        currency: "INR",
        receipt: crypto.randomUUID(),
    };

    try {
        const paymentResponse = await instance.orders.create(options);
        return res.json({
            success: true,
            message: paymentResponse,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Could not Initiate Order" });
    }
};

// Step 2: check Razorpay's signature, then enroll the student.
exports.verifyPayment = async (req, res) => {
    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        courses,
    } = req.body || {};
    const userId = req.user.id;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !Array.isArray(courses)) {
        return res.status(200).json({ success: false, message: "Payment Failed" });
    }

    const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

    const given = Buffer.from(String(razorpay_signature));
    const expected = Buffer.from(expectedSignature);
    const valid = given.length === expected.length && crypto.timingSafeEqual(given, expected);

    if (!valid) {
        return res.status(200).json({ success: false, message: "Payment Failed" });
    }

    try {
        await enrollStudents(courses, userId);
        return res.status(200).json({ success: true, message: "Payment Verified" });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Adds the student to each course exactly once (the $ne filter makes a replay a no-op).
const enrollStudents = async (courses, userId) => {
    for (const courseId of courses) {
        const updatedCourse = await Course.findOneAndUpdate(
            { _id: courseId, studentsEnrolled: { $ne: userId } },
            { $push: { studentsEnrolled: userId } },
            { new: true }
        );

        if (!updatedCourse) {
            const exists = await Course.exists({ _id: courseId });
            if (!exists) {
                throw new Error("Course not Found");
            }
            continue; // already enrolled
        }

        const courseProgress = await CourseProgress.create({
            courseID: courseId,
            userId: userId,
            completedVideos: [],
        });

        const updatedStudent = await User.findByIdAndUpdate(
            userId,
            {
                $push: {
                    courses: courseId,
                    courseProgress: courseProgress._id,
                },
            },
            { new: true }
        );

        await mailSender(
            updatedStudent.email,
            `Successfully Enrolled into ${updatedCourse.courseName}`,
            courseEnrollmentEmail(updatedCourse.courseName, `${updatedStudent.firstName}`)
        );
    }
};

exports.sendPaymentSuccessEmail = async (req, res) => {
    const { orderId, paymentId, amount } = req.body;
    const userId = req.user.id;

    if (!orderId || !paymentId || !amount || !userId) {
        return res.status(400).json({ success: false, message: "Please provide all the fields" });
    }

    try {
        const user = await User.findById(userId);
        await mailSender(
            user.email,
            "Payment Received",
            paymentSuccessEmail(`${user.firstName}`, amount / 100, orderId, paymentId)
        );
        return res.status(200).json({ success: true, message: "Payment email sent" });
    } catch (error) {
        console.log("error in sending mail", error);
        return res.status(500).json({ success: false, message: "Could not send email" });
    }
};
