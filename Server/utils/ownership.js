const Course = require("../models/Course");

// True when the logged-in instructor owns the course (or the course holding this section).
exports.instructorOwnsCourse = async (courseId, userId) => {
    try {
        return !!(await Course.exists({ _id: courseId, instructor: userId }));
    } catch (error) {
        return false;
    }
};

exports.instructorOwnsSection = async (sectionId, userId) => {
    try {
        return !!(await Course.exists({ courseContent: sectionId, instructor: userId }));
    } catch (error) {
        return false;
    }
};

exports.notYours = (res) =>
    res.status(403).json({
        success: false,
        message: "You can only change your own courses",
    });
