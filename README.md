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

Requirements: Node.js, a MongoDB database (a free MongoDB Atlas cluster works), and accounts for Cloudinary, Razorpay (test mode is fine) and an SMTP mailbox.

```bash
# 1. Install
npm install
cd Server && npm install && cd ..

# 2. Configure
cp .env.example .env                  # front end
cp Server/.env.example Server/.env    # API  (fill in the values, see the tables below)

# 3. Fill the empty database: categories, an admin account, optional demo course
cd Server
npm run seed -- --demo
#   set ADMIN_EMAIL and ADMIN_PASSWORD first if you want an admin account

# 4. Start the API (terminal 1)
npm run dev

# 5. Start the front end (terminal 2, from the repo root)
npm start
```

The front end runs on http://localhost:3000 and the API on http://localhost:4000.

Public sign-up only creates **Student** and **Instructor** accounts. The **Admin** account (who can create categories) comes from `npm run seed`.

### Front end `.env`

| Variable | Purpose |
|---|---|
| `REACT_APP_BASE_URL` | API base URL, e.g. `http://localhost:4000/api/v1` |
| `REACT_APP_RAZORPAY_KEY` | Razorpay key id (public key) used by the checkout script |

### API `Server/.env`

| Variable | Purpose |
|---|---|
| `PORT` | API port (default 4000) |
| `MONGODB_URL` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign tokens |
| `FRONTEND_URL` | Front-end address used in the password-reset email link (default `http://localhost:3000`) |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API |
| `MAIL_HOST`, `MAIL_USER`, `MAIL_PASS` | SMTP settings for OTP and notification emails (`MAIL_PORT` optional, default 587) |
| `CLOUD_NAME`, `API_KEY`, `API_SECRET`, `FOLDER_NAME` | Cloudinary credentials and upload folder |
| `RAZORPAY_KEY`, `RAZORPAY_SECRET` | Razorpay credentials |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Only used by `npm run seed` to create the admin |

Never commit real keys. Use Razorpay test keys while developing.

## Tests

```bash
cd Server
npm test
```

67 end-to-end checks run against the real Express app with an in-memory MongoDB and a local SMTP sink (no accounts needed; Cloudinary uploads and Razorpay order creation are stubbed). They cover sign-up with OTP, login, password change and reset, profile, categories, the course builder (course, sections, lectures), ownership rules between instructors, payment verification and enrolment, progress, reviews and deletes.

## Deployment

- **API:** `Server/` deploys as a Node web service (for example on Render, build `npm install`, start `npm start`). Set every variable from the table above in the host's dashboard, including `FRONTEND_URL` and `CORS_ORIGINS` with your deployed front-end address.
- **Database:** create a MongoDB Atlas cluster, add a database user, allow the host in *Network Access*, and put the connection string in `MONGODB_URL`. Then run `npm run seed` once from your machine with the same `MONGODB_URL` to create the categories and admin.
- **Front end:** build with `npm run build` and deploy the `build/` folder (for example on Vercel). Set `REACT_APP_BASE_URL` and `REACT_APP_RAZORPAY_KEY` in the host's environment variables.

If the API log shows `querySrv ENOTFOUND ... mongodb.net`, the cluster in `MONGODB_URL` no longer exists. The server stops when it cannot reach the database, so create a new cluster and update the variable.

## Notes

This project was started from the open-source `react-tailwind-css-starter-pack` template.

## License

MIT. See [LICENSE](LICENSE).
