const express = require("express");
const app = express();

const userRoutes = require("./routes/User");
const profileRoutes = require("./routes/Profile");
const paymentRoutes = require("./routes/Payments");
const courseRoutes = require("./routes/Course");

const database = require("./config/database");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const { cloudinaryConnect } = require("./config/cloudinary");
const fileUpload = require("express-fileupload");
const dotenv = require("dotenv");
const os = require("os");

dotenv.config();

const PORT = process.env.PORT || 4000;

/* ================= DATABASE ================= */

database.connectDB();

/* ================= MIDDLEWARES ================= */

app.use(express.json());
app.use(cookieParser());

/* ===== CORS FIX FOR VERCEL FRONTEND ===== */

const corsOptions = {
  origin: (process.env.CORS_ORIGINS || "https://studynotion-fullstack-26c4.vercel.app,http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
};

app.use(cors(corsOptions));

/* handle preflight requests */

app.options("*", cors(corsOptions));

/* ===== FILE UPLOAD ===== */

app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: os.tmpdir(),
  })
);

/* ================= CLOUDINARY ================= */

cloudinaryConnect();

/* ================= ROUTES ================= */

app.use("/api/v1/auth", userRoutes);
app.use("/api/v1/profile", profileRoutes);
app.use("/api/v1/course", courseRoutes);
app.use("/api/v1/payment", paymentRoutes);

/* ================= TEST ROUTE ================= */

app.get("/", (req, res) => {
  return res.json({
    success: true,
    message: "Your server is up and running....",
  });
});

/* ================= SERVER START ================= */

app.listen(PORT, () => {
  console.log(`App is running at ${PORT}`);
});
