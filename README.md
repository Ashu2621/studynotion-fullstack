# StudyNotion

A full-stack learning platform where instructors publish video courses and students buy, watch and track them. React front end, Node.js/Express REST API, MongoDB, Razorpay payments.

**Live front end:** https://studynotion-fullstack-26c4.vercel.app

## Features

**Accounts and security**
- Sign up with an email OTP, log in with JWT, reset a forgotten password by email, change password.
- Three roles, enforced by middleware on the API and by route guards in the UI: **Student**, **Instructor**, **Admin**.

**Instructors**
- Course builder: course details, sections and sub-sections (video lectures), then publish.
- Edit or delete courses; see enrolment and revenue in an instructor dashboard with charts.

**Students**
- Browse courses by category, view course details, add to cart, pay with Razorpay.
- Watch lectures, mark them complete and see course progress.
- Rate and review courses.

**Everyone**
- Profile page and settings: edit details, change display picture (Cloudinary), delete account.
- Transactional emails for OTP, enrolment, payment success and password updates.

**Admin**
- Create course categories.

## Tech stack

| Layer | Tools |
|---|---|
| Front end | React 18, Redux Toolkit, React Router 6, Tailwind CSS, React Hook Form, Axios, Chart.js, Swiper |
| Back end | Node.js, Express 4, Mongoose 7, JSON Web Tokens, bcrypt, Nodemailer, express-fileupload |
| Services | MongoDB, Cloudinary (media), Razorpay (payments), SMTP mail |
| Hosting | Vercel (front end), Render (API) |

## Project structure

```
.
├── src/                    # React app
│   ├── pages/              # Route-level pages
│   ├── components/         # Common, auth, dashboard, catalog, view-course UI
│   ├── slices/             # Redux slices: auth, profile, cart, course, viewCourse
│   └── services/           # Axios connector, endpoint list, API operations
└── Server/                 # Express API
    ├── config/             # MongoDB, Cloudinary, Razorpay setup
    ├── controllers/        # Auth, Course, Section, SubSection, Payments, Profile, ...
    ├── middlewares/        # auth, isStudent, isInstructor, isAdmin
    ├── models/             # User, Profile, Course, Section, SubSection, Category, ...
    ├── routes/             # User, Profile, Course, Payments
    ├── mail/templates/     # Email templates
    └── utils/              # Image upload, mail sender, duration helpers
```

## API overview

Base path: `/api/v1`

| Area | Examples |
|---|---|
| `/auth` | `POST /signup`, `POST /login`, `POST /sendotp`, `POST /changepassword`, `POST /reset-password-token`, `POST /reset-password` |
| `/profile` | `GET /getUserDetails`, `PUT /updateProfile`, `PUT /updateDisplayPicture`, `GET /getEnrolledCourses`, `GET /instructorDashboard`, `DELETE /deleteProfile` |
| `/course` | `POST /createCourse`, `POST /addSection`, `POST /addSubSection`, `GET /getAllCourses`, `POST /getCourseDetails`, `POST /updateCourseProgress`, `POST /createRating`, `GET /getReviews`, `POST /createCategory`, `GET /showAllCategories` |
| `/payment` | `POST /capturePayment`, `POST /verifyPayment`, `POST /sendPaymentSuccessEmail` |

Routes are protected by `auth` plus a role check (`isStudent`, `isInstructor`, `isAdmin`) where needed.

## Run locally

Requirements: Node.js, a MongoDB database, and accounts for Cloudinary, Razorpay (test mode is fine) and an SMTP mailbox.

```bash
# 1. Install
npm install
cd Server && npm install && cd ..

# 2. Configure (see the tables below)
#    .env          -> front end
#    Server/.env   -> API

# 3. Start the API (terminal 1)
cd Server && npm run dev

# 4. Start the front end (terminal 2, from the repo root)
npm start
```

The front end runs on http://localhost:3000 and the API on http://localhost:4000.

### Front end `.env`

| Variable | Purpose |
|---|---|
| `REACT_APP_BASE_URL` | API base URL, e.g. `http://localhost:4000/api/v1` |

### API `Server/.env`

| Variable | Purpose |
|---|---|
| `PORT` | API port (default 4000) |
| `MONGODB_URL` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign tokens |
| `MAIL_HOST`, `MAIL_USER`, `MAIL_PASS` | SMTP settings for OTP and notification emails |
| `CLOUD_NAME`, `API_KEY`, `API_SECRET`, `FOLDER_NAME` | Cloudinary credentials and upload folder |
| `RAZORPAY_KEY`, `RAZORPAY_SECRET` | Razorpay credentials |

Never commit real keys. Use Razorpay test keys while developing.

## Deployment

- **API:** `Server/` deploys as a Node web service (it also ships a `vercel.json`). Set the variables above in the host's dashboard.
- **Front end:** build with `npm run build` and deploy the `build/` folder (for example on Vercel). Set `REACT_APP_BASE_URL` to the deployed API.
- CORS in `Server/index.js` allows one front-end origin. Change it when you deploy under a different domain.

## Notes

This project was started from the open-source `react-tailwind-css-starter-pack` template.

## License

MIT. See [LICENSE](LICENSE).
