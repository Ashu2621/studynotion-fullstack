// Seeds a fresh database so the app is usable right away.
//
//   npm run seed                      -> default categories (+ admin if ADMIN_EMAIL/ADMIN_PASSWORD are set)
//   npm run seed -- --demo            -> also a demo instructor and one published demo course
//
// Safe to run more than once: it only creates what is missing.
// Needs MONGODB_URL (from Server/.env or the environment). No passwords are stored in the repo.
require("dotenv").config();
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const User = require("../models/User");
const Profile = require("../models/Profile");
const Category = require("../models/Category");
const Course = require("../models/Course");
const Section = require("../models/Section");
const SubSection = require("../models/SubSection");

const CATEGORIES = [
    { name: "Web Development", description: "Build websites and web apps with HTML, CSS, JavaScript, React and Node.js." },
    { name: "Python", description: "Learn Python for scripting, automation, data and back-end work." },
    { name: "Data Science", description: "Analyse data and build machine learning models." },
    { name: "Mobile Development", description: "Create apps for Android and iOS." },
];

async function makeUser({ firstName, lastName, email, password, accountType }) {
    const existing = await User.findOne({ email });
    if (existing) return { user: existing, created: false };
    const profile = await Profile.create({ gender: null, dateOfBirth: null, about: null, contactNumber: null });
    const user = await User.create({
        firstName, lastName, email, accountType,
        password: await bcrypt.hash(password, 10),
        approved: true,
        additionalDetails: profile._id,
        image: `https://api.dicebear.com/5.x/initials/svg?seed=${firstName} ${lastName}`,
    });
    return { user, created: true };
}

async function main() {
    if (!process.env.MONGODB_URL) {
        console.error("MONGODB_URL is not set. Add it to Server/.env first.");
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URL);
    console.log("Connected to MongoDB");

    // 1. categories
    for (const c of CATEGORIES) {
        if (!(await Category.exists({ name: c.name }))) {
            await Category.create(c);
            console.log("Created category:", c.name);
        }
    }

    // 2. admin (only the admin can create more categories from the UI)
    const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
        if (ADMIN_PASSWORD.length < 8) {
            console.error("ADMIN_PASSWORD must be at least 8 characters.");
            process.exit(1);
        }
        const { created } = await makeUser({ firstName: "Site", lastName: "Admin", email: ADMIN_EMAIL, password: ADMIN_PASSWORD, accountType: "Admin" });
        console.log(created ? `Created admin account ${ADMIN_EMAIL}` : `Admin ${ADMIN_EMAIL} already exists`);
    } else {
        console.log("Skipped admin: set ADMIN_EMAIL and ADMIN_PASSWORD to create one.");
    }

    // 3. optional demo content
    if (process.argv.includes("--demo")) {
        const demoPassword = process.env.DEMO_PASSWORD || crypto.randomBytes(9).toString("base64url");
        const { user: instructor, created } = await makeUser({
            firstName: "Demo", lastName: "Instructor", email: "demo.instructor@studynotion.example", password: demoPassword, accountType: "Instructor",
        });
        if (created) console.log(`Created demo instructor demo.instructor@studynotion.example  password: ${demoPassword}`);

        if (!(await Course.exists({ courseName: "Intro to Web Development (demo)" }))) {
            const category = await Category.findOne({ name: "Web Development" });
            const sub = await SubSection.create({
                title: "Welcome to the course",
                timeDuration: "10",
                description: "A short sample lecture.",
                videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
            });
            const section = await Section.create({ sectionName: "Getting started", subSection: [sub._id] });
            const course = await Course.create({
                courseName: "Intro to Web Development (demo)",
                description: "A sample course so the catalog is not empty.",
                instructor: instructor._id,
                whatWillYouLearn: "How a web page is built from HTML, CSS and JavaScript.",
                courseContent: [section._id],
                price: "499",
                thumbnail: "https://picsum.photos/seed/studynotion/800/450",
                tags: JSON.stringify(["web", "beginner"]),
                category: category._id,
                instructions: JSON.stringify(["A laptop with a browser"]),
                status: "Published",
            });
            await Category.findByIdAndUpdate(category._id, { $push: { course: course._id } });
            await User.findByIdAndUpdate(instructor._id, { $push: { courses: course._id } });
            console.log("Created demo course:", course.courseName);
        }
    }

    await mongoose.disconnect();
    console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
